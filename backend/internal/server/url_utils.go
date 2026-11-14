package server

import (
	"strings"
)

// CleanEndpointURL neteja i normalitza la URL d'un endpoint HTTP.
// Si l'usuari ha enganxat directament una comanda curl (p. ex: `curl -i https://domini.cat/health`
// o `curl -sSL "https://..."`), extreu automàticament la URL vàlida ignorant arguments i flags.
// Si no té prefix de protocol (`http://` o `https://`), afegeix l'esquema adequat.
func CleanEndpointURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// Si l'usuari ha enganxat una comanda curl de shell:
	if strings.HasPrefix(raw, "curl ") || strings.HasPrefix(raw, "curl\t") {
		fields := strings.Fields(raw)
		// 1r intent: buscar un token que comenci expressament per http:// o https://
		for _, field := range fields[1:] {
			trimmed := strings.Trim(field, `"'`)
			if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
				return trimmed
			}
		}
		// 2n intent: agafar el primer argument que no sigui un flag (-...)
		for _, field := range fields[1:] {
			trimmed := strings.Trim(field, `"'`)
			if !strings.HasPrefix(trimmed, "-") && len(trimmed) > 0 {
				raw = trimmed
				break
			}
		}
	}

	raw = strings.Trim(raw, `"'`)

	// Assegurar esquema si és un domini o localhost sense http:// ni https://
	if !strings.HasPrefix(raw, "http://") && !strings.HasPrefix(raw, "https://") {
		if strings.HasPrefix(raw, "localhost") || strings.HasPrefix(raw, "127.0.0.1") {
			return "http://" + raw
		}
		if strings.Contains(raw, ".") {
			return "https://" + raw
		}
	}

	return raw
}
