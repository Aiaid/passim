package sse

import (
	"sync"
	"testing"
	"time"
)

func TestSubscribeAndPublish(t *testing.T) {
	b := NewBroker()

	sub := b.Subscribe("metrics")
	defer b.Unsubscribe(sub)

	b.Publish(Event{Topic: "metrics", Type: "update", Data: `{"cpu":42}`})

	select {
	case e := <-sub.Chan():
		if e.Data != `{"cpu":42}` {
			t.Errorf("data = %q", e.Data)
		}
		if e.Type != "update" {
			t.Errorf("type = %q", e.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for event")
	}
}

func TestPublishToCorrectTopic(t *testing.T) {
	b := NewBroker()

	subA := b.Subscribe("metrics")
	subB := b.Subscribe("tasks")
	defer b.Unsubscribe(subA)
	defer b.Unsubscribe(subB)

	b.Publish(Event{Topic: "metrics", Data: "m1"})
	b.Publish(Event{Topic: "tasks", Data: "t1"})

	select {
	case e := <-subA.Chan():
		if e.Data != "m1" {
			t.Errorf("subA got %q, want m1", e.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("subA timeout")
	}

	select {
	case e := <-subB.Chan():
		if e.Data != "t1" {
			t.Errorf("subB got %q, want t1", e.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("subB timeout")
	}

	// subA should NOT get the tasks event
	select {
	case e := <-subA.Chan():
		t.Errorf("subA unexpectedly got: %v", e)
	case <-time.After(50 * time.Millisecond):
		// expected
	}
}

func TestMultipleTopics(t *testing.T) {
	b := NewBroker()

	sub := b.Subscribe("metrics", "tasks")
	defer b.Unsubscribe(sub)

	b.Publish(Event{Topic: "metrics", Data: "m"})
	b.Publish(Event{Topic: "tasks", Data: "t"})

	got := make([]string, 0, 2)
	for i := 0; i < 2; i++ {
		select {
		case e := <-sub.Chan():
			got = append(got, e.Data)
		case <-time.After(time.Second):
			t.Fatal("timeout")
		}
	}

	if len(got) != 2 {
		t.Fatalf("got %d events, want 2", len(got))
	}
}

func TestUnsubscribe(t *testing.T) {
	b := NewBroker()

	sub := b.Subscribe("test")
	if b.SubscriberCount() != 1 {
		t.Fatalf("count = %d, want 1", b.SubscriberCount())
	}

	b.Unsubscribe(sub)
	if b.SubscriberCount() != 0 {
		t.Fatalf("count = %d after unsubscribe, want 0", b.SubscriberCount())
	}

	// Channel should be closed
	_, ok := <-sub.Chan()
	if ok {
		t.Error("channel should be closed after unsubscribe")
	}
}

func TestEventFormat(t *testing.T) {
	tests := []struct {
		name string
		e    Event
		want string
	}{
		{
			name: "with type",
			e:    Event{Type: "update", Data: `{"x":1}`},
			want: "event: update\ndata: {\"x\":1}\n\n",
		},
		{
			name: "without type",
			e:    Event{Data: "hello"},
			want: "data: hello\n\n",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := tt.e.Format()
			if got != tt.want {
				t.Errorf("Format() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestConcurrentPublish(t *testing.T) {
	b := NewBroker()
	sub := b.Subscribe("test")
	defer b.Unsubscribe(sub)

	var wg sync.WaitGroup
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			b.Publish(Event{Topic: "test", Data: "msg"})
		}(i)
	}
	wg.Wait()

	// Drain events
	count := 0
	for {
		select {
		case <-sub.Chan():
			count++
		case <-time.After(100 * time.Millisecond):
			if count != 10 {
				t.Errorf("got %d events, want 10", count)
			}
			return
		}
	}
}

func TestSubscribeAll(t *testing.T) {
	b := NewBroker()

	// SubscribeAll should receive events on any topic
	allSub := b.SubscribeAll()
	defer b.Unsubscribe(allSub)

	// Regular subscriber should only receive its own topic
	topicSub := b.Subscribe("metrics")
	defer b.Unsubscribe(topicSub)

	b.Publish(Event{Topic: "metrics", Data: "m1"})
	b.Publish(Event{Topic: "tasks", Data: "t1"})
	b.Publish(Event{Topic: "app:xyz", Data: "a1"})

	// allSub should get all 3
	got := make([]string, 0, 3)
	for i := 0; i < 3; i++ {
		select {
		case e := <-allSub.Chan():
			got = append(got, e.Data)
		case <-time.After(time.Second):
			t.Fatalf("allSub timeout after %d events", i)
		}
	}
	if len(got) != 3 {
		t.Fatalf("allSub got %d events, want 3", len(got))
	}

	// topicSub should only get "m1"
	select {
	case e := <-topicSub.Chan():
		if e.Data != "m1" {
			t.Errorf("topicSub got %q, want m1", e.Data)
		}
	case <-time.After(time.Second):
		t.Fatal("topicSub timeout")
	}

	// topicSub should NOT get the other events
	select {
	case e := <-topicSub.Chan():
		t.Errorf("topicSub unexpectedly got: %v", e)
	case <-time.After(50 * time.Millisecond):
		// expected
	}
}

func TestPublishNoSubscribers(t *testing.T) {
	b := NewBroker()
	// Should not panic
	b.Publish(Event{Topic: "test", Data: "nobody home"})
}

func TestDropEventsWhenFull(t *testing.T) {
	b := NewBroker()
	sub := b.Subscribe("test")
	defer b.Unsubscribe(sub)

	// Fill the channel (buffer is 64)
	for i := 0; i < 100; i++ {
		b.Publish(Event{Topic: "test", Data: "msg"})
	}

	// Should not block or panic — just drops excess events
	count := 0
	for {
		select {
		case <-sub.Chan():
			count++
		case <-time.After(50 * time.Millisecond):
			if count > 64 {
				t.Errorf("got %d events, should be capped at buffer size", count)
			}
			return
		}
	}
}
