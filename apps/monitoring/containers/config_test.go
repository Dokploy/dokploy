package containers

import "testing"

func TestGetServiceName(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{"swarm replica 1", "myapp-3fa2bc.1.zxc4vplq8m0e", "myapp-3fa2bc"},
		{"swarm replica 2 collapses to the same service", "myapp-3fa2bc.2.a1b2c3d4e5f6", "myapp-3fa2bc"},
		{"leading slash is stripped", "/myapp-3fa2bc.1.zxc4vplq8m0e", "myapp-3fa2bc"},
		{"compose container_name stays distinct", "app-1425-mysql", "app-1425-mysql"},
		{"sibling compose service must not collapse with the previous one", "app-1425-redis", "app-1425-redis"},
		{"compose default naming stays distinct", "project-web-1", "project-web-1"},
		{"name without separators", "single", "single"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := GetServiceName(tc.in); got != tc.want {
				t.Errorf("GetServiceName(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
