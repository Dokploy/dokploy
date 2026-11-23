package monitoring

import (
	"os"
	"path/filepath"
	"testing"
)

func writeCgroup(t *testing.T, current, stat string) string {
	t.Helper()
	dir := t.TempDir()
	if current != "" {
		if err := os.WriteFile(filepath.Join(dir, "memory.current"), []byte(current), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if stat != "" {
		if err := os.WriteFile(filepath.Join(dir, "memory.stat"), []byte(stat), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return dir
}

func TestHostMemoryUsedGBSubtractsCache(t *testing.T) {
	dir := writeCgroup(t, "5651144704\n", "anon 2322817024\nfile 3003232256\nshmem 1\n")
	got := hostMemoryUsedGB(dir, 99, 6)
	if got < 2.4 || got > 2.5 {
		t.Fatalf("got %.3f GiB, want about 2.47", got)
	}
}

func TestHostMemoryUsedGBKeepsFallback(t *testing.T) {
	cases := map[string]string{
		"no memory.current":    writeCgroup(t, "", "file 1\n"),
		"no memory.stat":       writeCgroup(t, "100\n", ""),
		"no file line":         writeCgroup(t, "100\n", "anon 1\n"),
		"cache above current":  writeCgroup(t, "100\n", "file 200\n"),
		"used above the total": writeCgroup(t, "9663676416\n", "file 0\n"),
	}
	for name, dir := range cases {
		if got := hostMemoryUsedGB(dir, 1.5, 6); got != 1.5 {
			t.Errorf("%s: got %v, want the fallback 1.5", name, got)
		}
	}
}
