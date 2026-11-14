package server

import (
	"testing"
)

func TestCleanEndpointURL(t *testing.T) {
	cases := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "Comanda curl completa amb flags",
			input:    "curl -i https://api.yule.ericzapater.cat/health",
			expected: "https://api.yule.ericzapater.cat/health",
		},
		{
			name:     "Comanda curl amb cometes simples i múltiples flags",
			input:    "curl -sSL 'https://api.yule.ericzapater.cat/health'",
			expected: "https://api.yule.ericzapater.cat/health",
		},
		{
			name:     "Comanda curl amb cometes dobles i mètode -X",
			input:    `curl -X GET "http://localhost:8080/health"`,
			expected: "http://localhost:8080/health",
		},
		{
			name:     "Comanda curl sense protocol explícit",
			input:    "curl -k api.yule.ericzapater.cat/health",
			expected: "https://api.yule.ericzapater.cat/health",
		},
		{
			name:     "URL HTTPS directa",
			input:    "https://api.yule.ericzapater.cat/health",
			expected: "https://api.yule.ericzapater.cat/health",
		},
		{
			name:     "Domini sense protocol",
			input:    "api.yule.ericzapater.cat/health",
			expected: "https://api.yule.ericzapater.cat/health",
		},
		{
			name:     "Localhost sense protocol",
			input:    "localhost:3000/api",
			expected: "http://localhost:3000/api",
		},
		{
			name:     "IP 127.0.0.1 sense protocol",
			input:    "127.0.0.1:8081/health",
			expected: "http://127.0.0.1:8081/health",
		},
		{
			name:     "Buit",
			input:    "   ",
			expected: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CleanEndpointURL(tc.input)
			if got != tc.expected {
				t.Errorf("CleanEndpointURL(%q) = %q; s'esperava %q", tc.input, got, tc.expected)
			}
		})
	}
}
