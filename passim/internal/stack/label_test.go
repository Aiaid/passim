package stack

import "testing"

func TestContainerLabelsReservedOverridesUser(t *testing.T) {
	user := map[string]string{
		"app.kind":         "custom",
		LabelStackName:     "hacked",
		LabelComposeProject: "hacked",
	}
	got := ContainerLabels("id-1", "mystack", "web", 1, user)
	if got["app.kind"] != "custom" {
		t.Errorf("user label dropped: %v", got["app.kind"])
	}
	if got[LabelStackName] != "mystack" {
		t.Errorf("reserved label not enforced: %v", got[LabelStackName])
	}
	if got[LabelComposeProject] != "mystack" {
		t.Errorf("compose project not enforced: %v", got[LabelComposeProject])
	}
}

func TestContainerLabelsAllFieldsPresent(t *testing.T) {
	got := ContainerLabels("id-1", "mystack", "web", 3, nil)
	required := []string{
		LabelStackID, LabelStackName, LabelStackService,
		LabelComposeProject, LabelComposeService, LabelComposeContainer,
		LabelComposeVersion, LabelComposeOneOff,
	}
	for _, k := range required {
		if _, ok := got[k]; !ok {
			t.Errorf("missing label %q", k)
		}
	}
	if got[LabelComposeContainer] != "3" {
		t.Errorf("container number = %q", got[LabelComposeContainer])
	}
	if got[LabelComposeOneOff] != "False" {
		t.Errorf("oneoff = %q", got[LabelComposeOneOff])
	}
}

func TestNetworkAndVolumeLabels(t *testing.T) {
	n := NetworkLabels("id", "mystack", "frontend")
	if n[LabelComposeNetworkKey] != "frontend" {
		t.Errorf("network key = %v", n)
	}
	v := VolumeLabels("id", "mystack", "pgdata")
	if v[LabelComposeVolumeKey] != "pgdata" {
		t.Errorf("volume key = %v", v)
	}
}
