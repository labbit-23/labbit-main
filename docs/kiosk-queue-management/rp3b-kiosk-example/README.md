# RP3B Kiosk Setup Example

This folder contains example files for running the queue display on Raspberry Pi 3B in kiosk mode.

## Target URL

Use:

`https://api.sdrc.in/kiosk/display`

## Files

- `kiosk.sh.example`: Chromium kiosk launcher script.
- `kiosk.desktop.example`: Desktop autostart entry.

## Install Prerequisites (Raspberry Pi OS with Desktop)

```bash
sudo apt update
sudo apt install -y chromium-browser unclutter xdotool
```

## Enable Desktop Auto Login

```bash
sudo raspi-config
```

Set:

`System Options -> Boot / Auto Login -> Desktop Autologin`

## Deploy Example Files

```bash
cp docs/kiosk-queue-management/rp3b-kiosk-example/kiosk.sh.example ~/kiosk.sh
chmod +x ~/kiosk.sh
mkdir -p ~/.config/autostart
cp docs/kiosk-queue-management/rp3b-kiosk-example/kiosk.desktop.example ~/.config/autostart/kiosk.desktop
```

## Optional: Portrait Rotation

Edit `/boot/config.txt` and add one of:

- `display_rotate=1` (90° clockwise)
- `display_rotate=3` (90° counter-clockwise)

Then reboot.

## Reboot

```bash
sudo reboot
```

## Notes

- First visit may require kiosk login.
- Session remains active via kiosk auth cookie.
- Queue screen auto-refreshes and auto-pages.
