package stack

import "maps"

// Label keys.
const (
	LabelStackName    = "passim.stack"
	LabelStackService = "passim.stack.service"
	LabelStackID      = "passim.stack.id"

	LabelComposeProject    = "com.docker.compose.project"
	LabelComposeService    = "com.docker.compose.service"
	LabelComposeContainer  = "com.docker.compose.container-number"
	LabelComposeVersion    = "com.docker.compose.version"
	LabelComposeOneOff     = "com.docker.compose.oneoff"
	LabelComposeNetworkKey = "com.docker.compose.network"
	LabelComposeVolumeKey  = "com.docker.compose.volume"
)

// ComposeVersionTag identifies Passim as the compose client. Matches the major
// version docker compose CLI writes so tooling that parses this field doesn't
// trip over our value.
const ComposeVersionTag = "passim-1"

// ContainerLabels builds the label set for a stack-managed container.
// User-provided labels are merged in first, then Passim's reserved labels
// overwrite them to prevent forgery.
func ContainerLabels(stackID, stackName, serviceName string, containerNumber int, userLabels map[string]string) map[string]string {
	out := make(map[string]string, len(userLabels)+8)
	maps.Copy(out, userLabels)
	out[LabelStackID] = stackID
	out[LabelStackName] = stackName
	out[LabelStackService] = serviceName

	out[LabelComposeProject] = stackName
	out[LabelComposeService] = serviceName
	out[LabelComposeContainer] = itoa(containerNumber)
	out[LabelComposeVersion] = ComposeVersionTag
	out[LabelComposeOneOff] = "False"
	return out
}

// NetworkLabels builds labels for a stack-managed Docker network.
func NetworkLabels(stackID, stackName, networkName string) map[string]string {
	return map[string]string{
		LabelStackID:           stackID,
		LabelStackName:         stackName,
		LabelComposeProject:    stackName,
		LabelComposeNetworkKey: networkName,
		LabelComposeVersion:    ComposeVersionTag,
	}
}

// VolumeLabels builds labels for a stack-managed Docker volume.
func VolumeLabels(stackID, stackName, volumeName string) map[string]string {
	return map[string]string{
		LabelStackID:          stackID,
		LabelStackName:        stackName,
		LabelComposeProject:   stackName,
		LabelComposeVolumeKey: volumeName,
		LabelComposeVersion:   ComposeVersionTag,
	}
}

// itoa is a tiny int→string to avoid importing strconv for a single call.
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var buf [20]byte
	i := len(buf)
	neg := n < 0
	if neg {
		n = -n
	}
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}
