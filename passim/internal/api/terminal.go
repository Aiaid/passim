package api

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var wsUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// controlMessage is a JSON message from the client for terminal control.
type controlMessage struct {
	Type string `json:"type"`
	Cols uint   `json:"cols"`
	Rows uint   `json:"rows"`
}

func containerTerminalHandler(deps Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireDocker(deps, c) {
			return
		}

		id := c.Param("id")
		shell := c.DefaultQuery("shell", "/bin/sh")

		// Disable write deadline for long-lived WebSocket connection
		rc := http.NewResponseController(c.Writer)
		_ = rc.SetWriteDeadline(time.Time{})

		ws, err := wsUpgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Printf("terminal: websocket upgrade failed: %v", err)
			return
		}
		defer ws.Close()

		session, err := deps.Docker.ExecInteractive(c.Request.Context(), id, []string{shell})
		if err != nil {
			msg := websocket.FormatCloseMessage(websocket.CloseInternalServerErr, "failed to start shell: "+err.Error())
			ws.WriteMessage(websocket.CloseMessage, msg)
			return
		}
		defer session.Conn.Close()

		var wg sync.WaitGroup
		done := make(chan struct{})

		// Docker → WebSocket (container output to browser)
		wg.Add(1)
		go func() {
			defer wg.Done()
			buf := make([]byte, 4096)
			for {
				n, err := session.Conn.Reader.Read(buf)
				if n > 0 {
					if writeErr := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); writeErr != nil {
						return
					}
				}
				if err != nil {
					if err != io.EOF {
						select {
						case <-done:
						default:
							log.Printf("terminal: docker read error: %v", err)
						}
					}
					return
				}
			}
		}()

		// WebSocket → Docker (browser input to container)
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer close(done)
			for {
				msgType, data, err := ws.ReadMessage()
				if err != nil {
					return
				}
				switch msgType {
				case websocket.BinaryMessage:
					// Terminal input data
					if _, err := session.Conn.Conn.Write(data); err != nil {
						return
					}
				case websocket.TextMessage:
					// JSON control message (resize)
					var ctrl controlMessage
					if json.Unmarshal(data, &ctrl) == nil && ctrl.Type == "resize" {
						_ = deps.Docker.ResizeExec(c.Request.Context(), session.ID, ctrl.Rows, ctrl.Cols)
					}
				}
			}
		}()

		wg.Wait()
	}
}
