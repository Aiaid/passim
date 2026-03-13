package sse

import (
	"fmt"
	"sync"
)

// Event represents a Server-Sent Event.
type Event struct {
	Topic string
	Type  string // SSE event type (optional)
	Data  string
}

// Subscriber is a channel that receives events.
type Subscriber struct {
	ch     chan Event
	topics map[string]bool
}

// Broker manages SSE subscriptions and broadcasting.
type Broker struct {
	mu          sync.RWMutex
	subscribers map[*Subscriber]struct{}
}

// NewBroker creates a new SSE broker.
func NewBroker() *Broker {
	return &Broker{
		subscribers: make(map[*Subscriber]struct{}),
	}
}

// Subscribe creates a new subscriber for the given topics.
// The returned channel receives events matching any of the topics.
// Call Unsubscribe when done.
func (b *Broker) Subscribe(topics ...string) *Subscriber {
	topicMap := make(map[string]bool, len(topics))
	for _, t := range topics {
		topicMap[t] = true
	}

	sub := &Subscriber{
		ch:     make(chan Event, 64),
		topics: topicMap,
	}

	b.mu.Lock()
	b.subscribers[sub] = struct{}{}
	b.mu.Unlock()

	return sub
}

// Unsubscribe removes a subscriber and closes its channel.
func (b *Broker) Unsubscribe(sub *Subscriber) {
	b.mu.Lock()
	delete(b.subscribers, sub)
	b.mu.Unlock()
	close(sub.ch)
}

// Publish sends an event to all subscribers that are listening on the event's topic.
func (b *Broker) Publish(event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for sub := range b.subscribers {
		if sub.topics[event.Topic] {
			select {
			case sub.ch <- event:
			default:
				// Subscriber channel full, drop event to avoid blocking
			}
		}
	}
}

// Chan returns the subscriber's event channel.
func (s *Subscriber) Chan() <-chan Event {
	return s.ch
}

// Format formats an Event as an SSE-compliant string.
func (e Event) Format() string {
	result := ""
	if e.Type != "" {
		result += fmt.Sprintf("event: %s\n", e.Type)
	}
	result += fmt.Sprintf("data: %s\n\n", e.Data)
	return result
}

// SubscriberCount returns the number of active subscribers.
func (b *Broker) SubscriberCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers)
}
