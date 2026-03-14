package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/passim/passim/internal/speedtest"
)

// registerSpeedtestPublicRoutes registers public (no auth) speedtest endpoints.
func registerSpeedtestPublicRoutes(group *gin.RouterGroup) {
	st := group.Group("/speedtest")
	{
		st.GET("/download", speedtest.DownloadHandler)
		st.POST("/upload", speedtest.UploadHandler)
		st.GET("/ping", speedtest.PingHandler)
	}
}

// registerSpeedtestProtectedRoutes registers auth-protected speedtest endpoints.
func registerSpeedtestProtectedRoutes(group *gin.RouterGroup, iperf *speedtest.IperfServer) {
	st := group.Group("/speedtest")
	{
		st.GET("/iperf/status", iperfStatusHandler(iperf))
		st.POST("/iperf/start", iperfStartHandler(iperf))
		st.POST("/iperf/stop", iperfStopHandler(iperf))
	}
}

func iperfStatusHandler(iperf *speedtest.IperfServer) gin.HandlerFunc {
	return func(c *gin.Context) {
		status := "unavailable"
		if iperf != nil {
			status = iperf.Status()
		}
		c.JSON(http.StatusOK, gin.H{"status": status})
	}
}

func iperfStartHandler(iperf *speedtest.IperfServer) gin.HandlerFunc {
	return func(c *gin.Context) {
		if iperf == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "iperf3 not available"})
			return
		}
		if err := iperf.Start(); err != nil {
			c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": iperf.Status()})
	}
}

func iperfStopHandler(iperf *speedtest.IperfServer) gin.HandlerFunc {
	return func(c *gin.Context) {
		if iperf == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "iperf3 not available"})
			return
		}
		if err := iperf.Stop(); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": iperf.Status()})
	}
}
