# Terraform: DigitalOcean Matrix Homeserver

This stack provisions a low-cost Matrix homeserver base on DigitalOcean:

- Droplet (`tuwunel`/Conduit host)
- Persistent volume for Matrix data
- Firewall (SSH + `443` + `8448`)
- Optional DNS A record (when zone is managed by DigitalOcean)

It is intentionally isolated from `terraform/` (AWS state) to reduce blast radius.

## Usage

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and set real values.
2. Initialize and apply:

```bash
terraform init
terraform plan
terraform apply
```

## After Provisioning

1. Configure `conduit.toml` / `tuwunel`:
   - `server_name` = your real homeserver domain
   - `allow_registration = false`
   - `allow_federation = true`
2. Mount and use the attached volume for `/var/lib/tuwunel`.
3. Configure reverse proxy/TLS for client+federation traffic.
4. Point appservice URL to TomoriBot callback endpoint:
   - set `MATRIX_APPSERVICE_PUBLIC_URL` in TomoriBot secrets/env
   - use the same value in homeserver appservice config.
5. Keep bridge rooms non-E2EE (TomoriBot link command rejects encrypted rooms).

## Notes

- `enable_droplet_backups = true` provides managed droplet backups.
- Add additional offsite backup of Matrix DB/media if you need tighter RPO/RTO.
