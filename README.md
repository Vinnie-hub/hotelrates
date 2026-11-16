# HotelRate Dashboard

Static HTML/CSS/JS dashboard, no build step and no backend. Serve with `python3 -m http.server` (or any static host) and open `index.html`.

- `js/data.js` holds the hotel listings (USD rewards). `js/app.js` is the dashboard; all state lives in LocalStorage (`hotelrate.dashboard.v1`).
- Review counts, star ratings, balances, withdrawals and mobile-money requests are **simulated**. No real payments or verified review statistics.
- Countries: Kenya (KES), Uganda (UGX), Nigeria (NGN), Ghana (GHS), Tanzania (TZS), Malawi (MWK), Cameroon (XAF), Zambia (ZMW), Rwanda (RWF). Rates per $1 are indicative defaults editable in Profile & Settings; 5 reviews/day, reset at midnight in the selected country.
