# Shopping List CasaOS Package

This folder contains a CasaOS AppStore-style package for this project.

## What this package expects

- Your repository source code is available at `/DATA/AppData/shopping-list`.
- CasaOS can run Docker Compose builds on your machine.

The compose file builds your app image from local source and stores app data in:

- `/DATA/AppData/shopping-list/data`

## Install option 1: CasaOS Custom Install (UI)

1. Open CasaOS -> **App Store** -> **Custom Install**.
2. Copy the content from `docker-compose.yml` in this folder.
3. Paste into CasaOS and install.

## Install option 2: CasaOS CLI

```bash
casaos-cli app-management install -f /DATA/AppData/shopping-list/casaos/Apps/ShoppingList/docker-compose.yml
```

## First login

- username: `admin`
- password: `admin12345`

Override bootstrap credentials in CasaOS before first start:

- `BOOTSTRAP_ADMIN_USERNAME`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_NAME`

If the app already bootstrapped once, changing these values will not replace an existing admin user.
