mod igdb;
mod install;
mod net;
mod stripe;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            install::get_install_id,
            net::darke_fetch,
            net::fetch_favicon,
            net::fetch_book_cover,
            net::open_external_url,
            igdb::igdb_configured,
            igdb::igdb_games,
            igdb::igdb_game,
            stripe::stripe_configured,
            stripe::stripe_create_listing_checkout,
            stripe::stripe_listing_checkout_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
