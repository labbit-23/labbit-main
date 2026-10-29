# Panel environment (labit-main side)

Set in labit-main's server environment (never `NEXT_PUBLIC_*`):

    PANEL_API_URL=http://127.0.0.1:8100
    PANEL_INTERNAL_KEY=CHANGE-ME

`PANEL_INTERNAL_KEY` must match the FastAPI side's expected `X-Panel-Key`. If unset, `/api/panel/*`
fails closed with HTTP 500. Access is limited to executiveType `director` / `director_ceo`.
