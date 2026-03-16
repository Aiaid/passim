package db

import (
	"testing"
	"time"
)

func TestRemoteNodeCRUD(t *testing.T) {
	database := setupTestDB(t)

	node := &RemoteNode{
		ID:        "node-001",
		Name:      "Frankfurt VPS",
		Address:   "192.168.1.100:8443",
		APIKey:    "psk_abc123",
		Status:    "connecting",
		Country:   "DE",
		LastSeen:  "",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}

	// Create
	if err := CreateRemoteNode(database, node); err != nil {
		t.Fatal(err)
	}

	// Get
	got, err := GetRemoteNode(database, "node-001")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("node not found")
	}
	if got.Name != "Frankfurt VPS" {
		t.Errorf("name = %q, want Frankfurt VPS", got.Name)
	}
	if got.Address != "192.168.1.100:8443" {
		t.Errorf("address = %q", got.Address)
	}
	if got.APIKey != "psk_abc123" {
		t.Errorf("api_key = %q", got.APIKey)
	}
	if got.Status != "connecting" {
		t.Errorf("status = %q, want connecting", got.Status)
	}
	if got.Country != "DE" {
		t.Errorf("country = %q, want DE", got.Country)
	}
	if got.CreatedAt == "" {
		t.Error("created_at should be set")
	}

	// List
	nodes, err := ListRemoteNodes(database)
	if err != nil {
		t.Fatal(err)
	}
	if len(nodes) != 1 {
		t.Fatalf("len = %d, want 1", len(nodes))
	}

	// Update status
	if err := UpdateRemoteNodeStatus(database, "node-001", "connected"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetRemoteNode(database, "node-001")
	if got.Status != "connected" {
		t.Errorf("status = %q, want connected", got.Status)
	}

	// Update name
	if err := UpdateRemoteNodeName(database, "node-001", "Berlin VPS"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetRemoteNode(database, "node-001")
	if got.Name != "Berlin VPS" {
		t.Errorf("name = %q, want Berlin VPS", got.Name)
	}

	// Update last seen
	if err := UpdateRemoteNodeLastSeen(database, "node-001", "US"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetRemoteNode(database, "node-001")
	if got.Country != "US" {
		t.Errorf("country = %q, want US", got.Country)
	}
	if got.LastSeen == "" {
		t.Error("last_seen should be set after update")
	}

	// Delete
	if err := DeleteRemoteNode(database, "node-001"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetRemoteNode(database, "node-001")
	if got != nil {
		t.Error("node should be deleted")
	}

	// Delete nonexistent
	if err := DeleteRemoteNode(database, "nope"); err == nil {
		t.Error("expected error deleting nonexistent node")
	}
}

func TestGetRemoteNode_NotFound(t *testing.T) {
	database := setupTestDB(t)
	got, err := GetRemoteNode(database, "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil")
	}
}

func TestUpdateRemoteNodeStatus_NotFound(t *testing.T) {
	database := setupTestDB(t)
	if err := UpdateRemoteNodeStatus(database, "nonexistent", "connected"); err == nil {
		t.Error("expected error updating nonexistent node status")
	}
}

func TestUpdateRemoteNodeName_NotFound(t *testing.T) {
	database := setupTestDB(t)
	if err := UpdateRemoteNodeName(database, "nonexistent", "new name"); err == nil {
		t.Error("expected error updating nonexistent node name")
	}
}

func TestUpdateRemoteNodeLastSeen_NotFound(t *testing.T) {
	database := setupTestDB(t)
	if err := UpdateRemoteNodeLastSeen(database, "nonexistent", "US"); err == nil {
		t.Error("expected error updating nonexistent node last seen")
	}
}

func TestListRemoteNodes_Empty(t *testing.T) {
	database := setupTestDB(t)
	nodes, err := ListRemoteNodes(database)
	if err != nil {
		t.Fatal(err)
	}
	if nodes != nil {
		t.Errorf("expected nil slice, got %d items", len(nodes))
	}
}

func TestListRemoteNodes_Order(t *testing.T) {
	database := setupTestDB(t)

	now := time.Now().UTC()
	nodes := []RemoteNode{
		{ID: "node-a", Name: "A", Address: "1.1.1.1:8443", APIKey: "key-a", Status: "connected", CreatedAt: now.Add(-2 * time.Hour).Format(time.RFC3339)},
		{ID: "node-b", Name: "B", Address: "2.2.2.2:8443", APIKey: "key-b", Status: "connected", CreatedAt: now.Add(-1 * time.Hour).Format(time.RFC3339)},
		{ID: "node-c", Name: "C", Address: "3.3.3.3:8443", APIKey: "key-c", Status: "connected", CreatedAt: now.Format(time.RFC3339)},
	}

	for i := range nodes {
		if err := CreateRemoteNode(database, &nodes[i]); err != nil {
			t.Fatal(err)
		}
	}

	got, err := ListRemoteNodes(database)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	// Ordered by created_at DESC, so newest first
	if got[0].ID != "node-c" {
		t.Errorf("first node = %q, want node-c", got[0].ID)
	}
	if got[2].ID != "node-a" {
		t.Errorf("last node = %q, want node-a", got[2].ID)
	}
}

func TestRemoteDeploymentCRUD(t *testing.T) {
	database := setupTestDB(t)

	// Create a node first (foreign key context)
	node := &RemoteNode{
		ID:        "node-001",
		Name:      "Test Node",
		Address:   "10.0.0.1:8443",
		APIKey:    "psk_test",
		Status:    "connected",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := CreateRemoteNode(database, node); err != nil {
		t.Fatal(err)
	}

	rd := &RemoteDeployment{
		ID:       "deploy-001",
		NodeID:   "node-001",
		Template: "wireguard",
		Settings: `{"peers":2}`,
		Status:   "queued",
	}

	// Create
	if err := CreateRemoteDeployment(database, rd); err != nil {
		t.Fatal(err)
	}

	// List
	deployments, err := ListRemoteDeployments(database, "node-001")
	if err != nil {
		t.Fatal(err)
	}
	if len(deployments) != 1 {
		t.Fatalf("len = %d, want 1", len(deployments))
	}
	if deployments[0].Template != "wireguard" {
		t.Errorf("template = %q, want wireguard", deployments[0].Template)
	}
	if deployments[0].Settings != `{"peers":2}` {
		t.Errorf("settings = %q", deployments[0].Settings)
	}
	if deployments[0].Status != "queued" {
		t.Errorf("status = %q, want queued", deployments[0].Status)
	}
	if deployments[0].DeployedAt == "" {
		t.Error("deployed_at should be set")
	}

	// Update status
	if err := UpdateRemoteDeploymentStatus(database, "deploy-001", "running", ""); err != nil {
		t.Fatal(err)
	}
	deployments, _ = ListRemoteDeployments(database, "node-001")
	if deployments[0].Status != "running" {
		t.Errorf("status = %q, want running", deployments[0].Status)
	}

	// Update status with error
	if err := UpdateRemoteDeploymentStatus(database, "deploy-001", "failed", "port conflict"); err != nil {
		t.Fatal(err)
	}
	deployments, _ = ListRemoteDeployments(database, "node-001")
	if deployments[0].Status != "failed" {
		t.Errorf("status = %q, want failed", deployments[0].Status)
	}
	if deployments[0].Error != "port conflict" {
		t.Errorf("error = %q, want port conflict", deployments[0].Error)
	}

	// Update nonexistent
	if err := UpdateRemoteDeploymentStatus(database, "nope", "running", ""); err == nil {
		t.Error("expected error updating nonexistent deployment")
	}

	// List for different node — empty
	deployments, err = ListRemoteDeployments(database, "node-999")
	if err != nil {
		t.Fatal(err)
	}
	if deployments != nil {
		t.Errorf("expected nil slice, got %d items", len(deployments))
	}
}

func TestS3CredentialCRUD(t *testing.T) {
	database := setupTestDB(t)

	s := &S3Credential{
		ID:        "s3-001",
		Name:      "Backblaze",
		Endpoint:  "s3.us-west-001.backblazeb2.com",
		Bucket:    "my-bucket",
		AccessKey: "access123",
		SecretKey: "secret456",
	}

	// Create
	if err := CreateS3(database, s); err != nil {
		t.Fatal(err)
	}

	// Get
	got, err := GetS3(database, "s3-001")
	if err != nil {
		t.Fatal(err)
	}
	if got == nil {
		t.Fatal("s3 credential not found")
	}
	if got.Name != "Backblaze" {
		t.Errorf("name = %q, want Backblaze", got.Name)
	}
	if got.Endpoint != "s3.us-west-001.backblazeb2.com" {
		t.Errorf("endpoint = %q", got.Endpoint)
	}
	if got.Bucket != "my-bucket" {
		t.Errorf("bucket = %q", got.Bucket)
	}
	if got.AccessKey != "access123" {
		t.Errorf("access_key = %q", got.AccessKey)
	}
	if got.SecretKey != "secret456" {
		t.Errorf("secret_key = %q", got.SecretKey)
	}
	if got.CreatedAt == "" {
		t.Error("created_at should be set")
	}

	// List
	creds, err := ListS3(database)
	if err != nil {
		t.Fatal(err)
	}
	if len(creds) != 1 {
		t.Fatalf("len = %d, want 1", len(creds))
	}

	// Update
	s.Name = "Backblaze B2"
	s.Bucket = "new-bucket"
	if err := UpdateS3(database, s); err != nil {
		t.Fatal(err)
	}
	got, _ = GetS3(database, "s3-001")
	if got.Name != "Backblaze B2" {
		t.Errorf("name = %q, want Backblaze B2", got.Name)
	}
	if got.Bucket != "new-bucket" {
		t.Errorf("bucket = %q, want new-bucket", got.Bucket)
	}

	// Delete
	if err := DeleteS3(database, "s3-001"); err != nil {
		t.Fatal(err)
	}
	got, _ = GetS3(database, "s3-001")
	if got != nil {
		t.Error("s3 credential should be deleted")
	}

	// Delete nonexistent
	if err := DeleteS3(database, "nope"); err == nil {
		t.Error("expected error deleting nonexistent s3 credential")
	}
}

func TestGetS3_NotFound(t *testing.T) {
	database := setupTestDB(t)
	got, err := GetS3(database, "nonexistent")
	if err != nil {
		t.Fatal(err)
	}
	if got != nil {
		t.Error("expected nil")
	}
}

func TestUpdateS3_NotFound(t *testing.T) {
	database := setupTestDB(t)
	s := &S3Credential{
		ID:        "nonexistent",
		Name:      "test",
		Endpoint:  "endpoint",
		Bucket:    "bucket",
		AccessKey: "ak",
		SecretKey: "sk",
	}
	if err := UpdateS3(database, s); err == nil {
		t.Error("expected error updating nonexistent s3 credential")
	}
}

func TestListS3_Empty(t *testing.T) {
	database := setupTestDB(t)
	creds, err := ListS3(database)
	if err != nil {
		t.Fatal(err)
	}
	if creds != nil {
		t.Errorf("expected nil slice, got %d items", len(creds))
	}
}

func TestCreateRemoteNode_DuplicateID(t *testing.T) {
	database := setupTestDB(t)

	node := &RemoteNode{
		ID:        "node-dup",
		Name:      "First",
		Address:   "1.1.1.1:8443",
		APIKey:    "key1",
		Status:    "connecting",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := CreateRemoteNode(database, node); err != nil {
		t.Fatal(err)
	}

	node2 := &RemoteNode{
		ID:        "node-dup",
		Name:      "Second",
		Address:   "2.2.2.2:8443",
		APIKey:    "key2",
		Status:    "connecting",
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	}
	if err := CreateRemoteNode(database, node2); err == nil {
		t.Error("expected error for duplicate node ID")
	}
}
