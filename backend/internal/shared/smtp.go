package shared

import (
	"fmt"
	"net/smtp"
	"os"
	"strconv"
	"strings"
)

// SMTPConfig conté els paràmetres d'enviament de correu per SMTP.
type SMTPConfig struct {
	Enabled       bool     `json:"enabled" yaml:"enabled"`
	UseGlobalSMTP bool     `json:"use_global_smtp" yaml:"use_global_smtp"`
	Host          string   `json:"host,omitempty" yaml:"host,omitempty"`
	Port          int      `json:"port,omitempty" yaml:"port,omitempty"`
	Username      string   `json:"username,omitempty" yaml:"username,omitempty"`
	Password      string   `json:"password,omitempty" yaml:"password,omitempty"`
	FromEmail     string   `json:"from_email,omitempty" yaml:"from_email,omitempty"`
	ToEmails      []string `json:"to_emails" yaml:"to_emails"`
}

// ResolveGlobalSMTP emplena els camps d'SMTP amb les variables d'entorn globals quan UseGlobalSMTP == true.
func ResolveGlobalSMTP(cfg SMTPConfig) SMTPConfig {
	resolved := cfg
	if resolved.UseGlobalSMTP || resolved.Host == "" {
		if h := os.Getenv("SMTP_HOST"); h != "" {
			resolved.Host = h
		}
		if p := os.Getenv("SMTP_PORT"); p != "" {
			if portNum, err := strconv.Atoi(p); err == nil {
				resolved.Port = portNum
			}
		}
		if u := os.Getenv("SMTP_USER"); u != "" {
			resolved.Username = u
		}
		if pw := os.Getenv("SMTP_PASSWORD"); pw != "" {
			resolved.Password = pw
		}
		if from := os.Getenv("SMTP_FROM"); from != "" {
			resolved.FromEmail = from
		}
	}
	if resolved.Port == 0 {
		resolved.Port = 587
	}
	if resolved.FromEmail == "" {
		resolved.FromEmail = "alerts@rawcraft.local"
	}
	return resolved
}

// SendAlertEmail envia un correu d'alerta o recuperació via SMTP.
func SendAlertEmail(cfg SMTPConfig, subject, body string) error {
	resolved := ResolveGlobalSMTP(cfg)
	if !resolved.Enabled || len(resolved.ToEmails) == 0 || resolved.Host == "" {
		return nil
	}

	addr := fmt.Sprintf("%s:%d", resolved.Host, resolved.Port)
	var auth smtp.Auth
	if resolved.Username != "" && resolved.Password != "" {
		auth = smtp.PlainAuth("", resolved.Username, resolved.Password, resolved.Host)
	}

	headers := []string{
		fmt.Sprintf("From: %s", resolved.FromEmail),
		fmt.Sprintf("To: %s", strings.Join(resolved.ToEmails, ", ")),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=\"UTF-8\"",
	}
	msg := strings.Join(headers, "\r\n") + "\r\n\r\n" + body + "\r\n"

	return smtp.SendMail(addr, auth, resolved.FromEmail, resolved.ToEmails, []byte(msg))
}
