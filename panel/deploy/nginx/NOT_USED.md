# nginx: nothing to deploy for the panel

The panel is embedded in labit-main and served at lab.sdrc.in/panel by labit-main's existing nginx/PM2 setup on VPS1.
No new server block, no new DNS record, no certbot. The former `panel.labit.online*.conf` files were retired and removed
(they were git-untracked, so nothing to revert). `panel-api` listens on 127.0.0.1:8100 only and is never proxied.
