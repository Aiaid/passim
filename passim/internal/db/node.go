package db

import (
	"database/sql"
	"fmt"
	"time"
)

// RemoteNode represents a remote Passim instance managed by this hub.
type RemoteNode struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Address   string `json:"address"`
	APIKey    string `json:"api_key"`
	Status    string `json:"status"`
	Country   string `json:"country,omitempty"`
	LastSeen  string `json:"last_seen,omitempty"`
	CreatedAt string `json:"created_at"`
}

// CreateRemoteNode inserts a new remote node.
func CreateRemoteNode(database *sql.DB, node *RemoteNode) error {
	_, err := database.Exec(
		`INSERT INTO remote_nodes (id, name, address, api_key, status, country, last_seen, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		node.ID, node.Name, node.Address, node.APIKey, node.Status, node.Country, node.LastSeen, node.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("create remote node: %w", err)
	}
	return nil
}

// GetRemoteNode retrieves a remote node by ID. Returns nil if not found.
func GetRemoteNode(database *sql.DB, id string) (*RemoteNode, error) {
	var n RemoteNode
	err := database.QueryRow(
		`SELECT id, COALESCE(name,''), address, api_key, COALESCE(status,'disconnected'), COALESCE(country,''), COALESCE(last_seen,''), COALESCE(created_at,'')
		 FROM remote_nodes WHERE id = ?`, id,
	).Scan(&n.ID, &n.Name, &n.Address, &n.APIKey, &n.Status, &n.Country, &n.LastSeen, &n.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get remote node %s: %w", id, err)
	}
	return &n, nil
}

// ListRemoteNodes returns all remote nodes ordered by creation time descending.
func ListRemoteNodes(database *sql.DB) ([]RemoteNode, error) {
	rows, err := database.Query(
		`SELECT id, COALESCE(name,''), address, api_key, COALESCE(status,'disconnected'), COALESCE(country,''), COALESCE(last_seen,''), COALESCE(created_at,'')
		 FROM remote_nodes ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list remote nodes: %w", err)
	}
	defer rows.Close()

	var nodes []RemoteNode
	for rows.Next() {
		var n RemoteNode
		if err := rows.Scan(&n.ID, &n.Name, &n.Address, &n.APIKey, &n.Status, &n.Country, &n.LastSeen, &n.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan remote node: %w", err)
		}
		nodes = append(nodes, n)
	}
	return nodes, rows.Err()
}

// UpdateRemoteNodeStatus updates the status of a remote node.
func UpdateRemoteNodeStatus(database *sql.DB, id, status string) error {
	res, err := database.Exec(
		`UPDATE remote_nodes SET status = ? WHERE id = ?`,
		status, id,
	)
	if err != nil {
		return fmt.Errorf("update remote node status %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("remote node %s not found", id)
	}
	return nil
}

// UpdateRemoteNodeName updates the name of a remote node.
func UpdateRemoteNodeName(database *sql.DB, id, name string) error {
	res, err := database.Exec(
		`UPDATE remote_nodes SET name = ? WHERE id = ?`,
		name, id,
	)
	if err != nil {
		return fmt.Errorf("update remote node name %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("remote node %s not found", id)
	}
	return nil
}

// UpdateRemoteNodeLastSeen updates last_seen to now and country for a remote node.
func UpdateRemoteNodeLastSeen(database *sql.DB, id, country string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := database.Exec(
		`UPDATE remote_nodes SET last_seen = ?, country = ? WHERE id = ?`,
		now, country, id,
	)
	if err != nil {
		return fmt.Errorf("update remote node last seen %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("remote node %s not found", id)
	}
	return nil
}

// DeleteRemoteNode deletes a remote node by ID.
func DeleteRemoteNode(database *sql.DB, id string) error {
	res, err := database.Exec(`DELETE FROM remote_nodes WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete remote node %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("remote node %s not found", id)
	}
	return nil
}

// RemoteDeployment represents a deployment on a remote node.
type RemoteDeployment struct {
	ID         string `json:"id"`
	NodeID     string `json:"node_id"`
	Template   string `json:"template"`
	Settings   string `json:"settings"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	DeployedAt string `json:"deployed_at"`
	UpdatedAt  string `json:"updated_at"`
}

// CreateRemoteDeployment inserts a new remote deployment.
func CreateRemoteDeployment(database *sql.DB, rd *RemoteDeployment) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := database.Exec(
		`INSERT INTO remote_deployments (id, node_id, template, settings, status, error, deployed_at, updated_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		rd.ID, rd.NodeID, rd.Template, rd.Settings, rd.Status, rd.Error, now, now,
	)
	if err != nil {
		return fmt.Errorf("create remote deployment: %w", err)
	}
	return nil
}

// UpdateRemoteDeploymentStatus updates the status and error of a remote deployment.
func UpdateRemoteDeploymentStatus(database *sql.DB, id, status, errMsg string) error {
	now := time.Now().UTC().Format(time.RFC3339)
	res, err := database.Exec(
		`UPDATE remote_deployments SET status = ?, error = ?, updated_at = ? WHERE id = ?`,
		status, errMsg, now, id,
	)
	if err != nil {
		return fmt.Errorf("update remote deployment status %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("remote deployment %s not found", id)
	}
	return nil
}

// ListRemoteDeployments returns all deployments for a given node.
func ListRemoteDeployments(database *sql.DB, nodeID string) ([]RemoteDeployment, error) {
	rows, err := database.Query(
		`SELECT id, node_id, template, settings, status, COALESCE(error,''), COALESCE(deployed_at,''), COALESCE(updated_at,'')
		 FROM remote_deployments WHERE node_id = ? ORDER BY updated_at DESC`,
		nodeID,
	)
	if err != nil {
		return nil, fmt.Errorf("list remote deployments: %w", err)
	}
	defer rows.Close()

	var deployments []RemoteDeployment
	for rows.Next() {
		var d RemoteDeployment
		if err := rows.Scan(&d.ID, &d.NodeID, &d.Template, &d.Settings, &d.Status, &d.Error, &d.DeployedAt, &d.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan remote deployment: %w", err)
		}
		deployments = append(deployments, d)
	}
	return deployments, rows.Err()
}

// S3Credential represents stored S3-compatible storage credentials.
type S3Credential struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Endpoint  string `json:"endpoint"`
	Bucket    string `json:"bucket"`
	AccessKey string `json:"access_key"`
	SecretKey string `json:"secret_key"`
	CreatedAt string `json:"created_at"`
}

// CreateS3 inserts a new S3 credential.
func CreateS3(database *sql.DB, s *S3Credential) error {
	now := time.Now().UTC().Format(time.RFC3339)
	_, err := database.Exec(
		`INSERT INTO s3_credentials (id, name, endpoint, bucket, access_key, secret_key, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.Name, s.Endpoint, s.Bucket, s.AccessKey, s.SecretKey, now,
	)
	if err != nil {
		return fmt.Errorf("create s3 credential: %w", err)
	}
	return nil
}

// GetS3 retrieves an S3 credential by ID. Returns nil if not found.
func GetS3(database *sql.DB, id string) (*S3Credential, error) {
	var s S3Credential
	err := database.QueryRow(
		`SELECT id, COALESCE(name,''), COALESCE(endpoint,''), COALESCE(bucket,''), COALESCE(access_key,''), COALESCE(secret_key,''), COALESCE(created_at,'')
		 FROM s3_credentials WHERE id = ?`, id,
	).Scan(&s.ID, &s.Name, &s.Endpoint, &s.Bucket, &s.AccessKey, &s.SecretKey, &s.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("get s3 credential %s: %w", id, err)
	}
	return &s, nil
}

// ListS3 returns all S3 credentials ordered by creation time descending.
func ListS3(database *sql.DB) ([]S3Credential, error) {
	rows, err := database.Query(
		`SELECT id, COALESCE(name,''), COALESCE(endpoint,''), COALESCE(bucket,''), COALESCE(access_key,''), COALESCE(secret_key,''), COALESCE(created_at,'')
		 FROM s3_credentials ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("list s3 credentials: %w", err)
	}
	defer rows.Close()

	var creds []S3Credential
	for rows.Next() {
		var s S3Credential
		if err := rows.Scan(&s.ID, &s.Name, &s.Endpoint, &s.Bucket, &s.AccessKey, &s.SecretKey, &s.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan s3 credential: %w", err)
		}
		creds = append(creds, s)
	}
	return creds, rows.Err()
}

// UpdateS3 updates an existing S3 credential.
func UpdateS3(database *sql.DB, s *S3Credential) error {
	res, err := database.Exec(
		`UPDATE s3_credentials SET name = ?, endpoint = ?, bucket = ?, access_key = ?, secret_key = ? WHERE id = ?`,
		s.Name, s.Endpoint, s.Bucket, s.AccessKey, s.SecretKey, s.ID,
	)
	if err != nil {
		return fmt.Errorf("update s3 credential %s: %w", s.ID, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("s3 credential %s not found", s.ID)
	}
	return nil
}

// DeleteS3 deletes an S3 credential by ID.
func DeleteS3(database *sql.DB, id string) error {
	res, err := database.Exec(`DELETE FROM s3_credentials WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("delete s3 credential %s: %w", id, err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("s3 credential %s not found", id)
	}
	return nil
}
