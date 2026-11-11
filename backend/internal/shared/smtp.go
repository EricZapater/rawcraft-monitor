package shared

import (
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"os"
	"strconv"
	"strings"
	"time"
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
// Suporta tant port 465 (SSL/TLS directe) com ports 587/25 (STARTTLS).
func SendAlertEmail(cfg SMTPConfig, subject, body string) error {
	resolved := ResolveGlobalSMTP(cfg)
	if !resolved.Enabled {
		return nil
	}
	if len(resolved.ToEmails) == 0 {
		log.Printf("[smtp] Enviament omès: no hi ha destinataris configurats (to_emails buit)")
		return nil
	}
	if resolved.Host == "" {
		log.Printf("[smtp] Enviament omès: servidor SMTP no definit (host buit)")
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
	msg := []byte(strings.Join(headers, "\r\n") + "\r\n\r\n" + body + "\r\n")

	mode := "STARTTLS/Plain"
	if resolved.Port == 465 {
		mode = "SSL/TLS directe"
	}
	log.Printf("[smtp] Enviant correu a %v via %s (mode %s, remitent: %s)...",
		resolved.ToEmails, addr, mode, resolved.FromEmail)

	var err error
	if resolved.Port == 465 {
		err = sendViaDirectTLS(addr, resolved.Host, auth, resolved.FromEmail, resolved.ToEmails, msg)
	} else {
		err = smtp.SendMail(addr, auth, resolved.FromEmail, resolved.ToEmails, msg)
	}

	if err != nil {
		log.Printf("[smtp] ERROR enviant correu a %s: %v", addr, err)
		return err
	}

	log.Printf("[smtp] Correu enviat correctament a %v ('%s')", resolved.ToEmails, subject)
	return nil
}

func sendViaDirectTLS(addr, host string, auth smtp.Auth, from string, to []string, msg []byte) error {
	tlsConfig := &tls.Config{
		ServerName: host,
	}
	dialer := &net.Dialer{Timeout: 15 * time.Second}
	conn, err := tls.DialWithDialer(dialer, "tcp", addr, tlsConfig)
	if err != nil {
		return fmt.Errorf("tls dial (%s): %w", addr, err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return fmt.Errorf("smtp client creation (%s): %w", addr, err)
	}
	defer client.Close()

	if auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			if err := client.Auth(auth); err != nil {
				return fmt.Errorf("smtp auth error: %w", err)
			}
		}
	}

	if err := client.Mail(from); err != nil {
		return fmt.Errorf("smtp mail from (%s): %w", from, err)
	}
	for _, recipient := range to {
		if err := client.Rcpt(recipient); err != nil {
			return fmt.Errorf("smtp rcpt to (%s): %w", recipient, err)
		}
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("smtp data command: %w", err)
	}
	if _, err := w.Write(msg); err != nil {
		return fmt.Errorf("smtp write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("smtp close data: %w", err)
	}

	return client.Quit()
}
