# HotelRate Dashboard

Static HTML/CSS/JS dashboard, no build step and no backend. Serve with `python3 -m http.server` (or any static host) and open `index.html`.

- `js/data.js` holds the hotel listings (USD rewards). `js/app.js` is the dashboard; all state lives in LocalStorage (`hotelrate.dashboard.v1`).
- Review counts, star ratings, balances, withdrawals and mobile-money requests are **simulated**. No real payments or verified review statistics.
- Countries: Kenya (KES), Uganda (UGX), Nigeria (NGN), Ghana (GHS), Tanzania (TZS), Malawi (MWK), Cameroon (XAF), Zambia (ZMW), Rwanda (RWF). Rates per $1 are indicative defaults editable in Profile & Settings; 3 reviews/day (rejected reviews still count), reset at midnight in the selected country.

- **Withdrawal lock:** withdrawal requests are rejected until the user has at least 3 successful referrals (`MIN_REFERRALS` in `js/app.js`, count stored in `S.referrals`).
