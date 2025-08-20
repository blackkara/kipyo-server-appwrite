# SMTP Configuration Guide

## Environment Variables

Add the following SMTP configuration to your `.env.local` file:

```env
# SMTP Configuration
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password

# Email From Address
EMAIL_FROM=noreply@your-domain.com
```

## Common SMTP Providers

### SendGrid
```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Mailgun
```env
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
```

### Amazon SES
```env
SMTP_HOST=email-smtp.region.amazonaws.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-ses-smtp-username
SMTP_PASS=your-ses-smtp-password
```

### Outlook/Office365
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
```

### Custom SMTP Server
```env
SMTP_HOST=mail.your-server.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-username
SMTP_PASS=your-password
```

## Port Configuration

- **Port 587**: TLS/STARTTLS (recommended) - Set `SMTP_SECURE=false`
- **Port 465**: SSL/TLS - Set `SMTP_SECURE=true`
- **Port 25**: Non-encrypted (not recommended)

## Testing

To test your SMTP configuration:

1. Set up your environment variables
2. Start the server
3. Try sending an OTP through the account deletion flow
4. Check server logs for any SMTP errors

## Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Double-check your SMTP_USER and SMTP_PASS
   - Some providers require app-specific passwords

2. **Connection Timeout**
   - Check if SMTP_HOST and SMTP_PORT are correct
   - Verify firewall settings allow outbound SMTP

3. **SSL/TLS Errors**
   - Toggle SMTP_SECURE between true/false
   - Port 587 usually needs SMTP_SECURE=false
   - Port 465 usually needs SMTP_SECURE=true

4. **Emails Not Delivered**
   - Check spam folder
   - Verify EMAIL_FROM is authorized by your SMTP provider
   - Some providers require domain verification

## Security Notes

- Never commit SMTP credentials to version control
- Use environment variables for all sensitive data
- Consider using API-based email services for better deliverability
- Implement rate limiting to prevent email abuse