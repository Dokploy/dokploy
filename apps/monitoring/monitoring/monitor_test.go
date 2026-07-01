package monitoring

import (
	"net"
	"testing"
)

func withLookupCallbackIP(t *testing.T, lookup func(string) ([]net.IP, error)) {
	t.Helper()

	original := lookupCallbackIP
	lookupCallbackIP = lookup
	t.Cleanup(func() {
		lookupCallbackIP = original
	})
}

func TestValidatePublicCallbackURLRejectsPrivateDokployNotificationHost(t *testing.T) {
	withLookupCallbackIP(t, func(host string) ([]net.IP, error) {
		if host != "dokploy.example.com" {
			t.Fatalf("unexpected hostname lookup: %s", host)
		}
		return []net.IP{net.ParseIP("10.0.0.10")}, nil
	})

	err := validatePublicCallbackURL("https://dokploy.example.com/api/trpc/notification.receiveNotification")
	if err == nil {
		t.Fatal("expected private notification callback host to be rejected")
	}
	if err.Error() != "callback URL resolves to a host that is not allowed" {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestValidatePublicCallbackURLAllowsPublicDokployNotificationHost(t *testing.T) {
	withLookupCallbackIP(t, func(host string) ([]net.IP, error) {
		if host != "dokploy.example.com" {
			t.Fatalf("unexpected hostname lookup: %s", host)
		}
		return []net.IP{net.ParseIP("93.184.216.34")}, nil
	})

	if err := validatePublicCallbackURL("https://dokploy.example.com/api/trpc/notification.receiveNotification"); err != nil {
		t.Fatalf("expected public notification callback host to be allowed: %v", err)
	}
}
