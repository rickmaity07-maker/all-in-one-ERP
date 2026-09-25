#[cfg(mobile)]
mod android_update {
  // Android updates are a new APK from the latest GitHub release. The check runs here, natively,
  // once at start-up; the page only reads the stored answer (an instant call), so reloading or
  // navigating while GitHub is slow can never leave a reply without a page to deliver it to.
  use std::sync::Mutex;
  use tauri_plugin_http::reqwest;

  const REPO: &str = "https://github.com/rickmaity07-maker/all-in-one-ERP";

  #[derive(Clone, serde::Serialize, Default)]
  pub struct Latest {
    pub version: String,
    pub apk_url: Option<String>,
    pub notes: Option<String>,
  }

  #[derive(Default)]
  pub struct State(pub Mutex<Option<Result<Latest, String>>>);

  pub async fn fetch() -> Result<Latest, String> {
    let client = reqwest::Client::builder().user_agent("all-in-one-erp-android").build().map_err(|e| e.to_string())?;
    let body = client
      .get(format!("{REPO}/releases/latest/download/latest.json"))
      .send().await.map_err(|e| e.to_string())?
      .error_for_status().map_err(|e| e.to_string())?
      .text().await.map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let version = json["version"].as_str().unwrap_or_default().trim_start_matches('v').to_string();
    let notes = json["notes"].as_str().map(str::to_string);
    if version.is_empty() {
      return Ok(Latest::default());
    }
    // The APK is attached a few minutes after the desktop build; only offer it once it exists.
    let url = format!("{REPO}/releases/download/v{version}/all-in-one-erp-{version}.apk");
    let exists = client.head(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false);
    Ok(Latest { version, apk_url: exists.then_some(url), notes })
  }

  // Stored result of the start-up check (null while it is still running).
  #[tauri::command]
  pub fn android_latest_release(state: tauri::State<'_, State>) -> Option<Result<Latest, String>> {
    state.0.lock().unwrap().clone()
  }

  // "Check for updates" pressed: check again now.
  #[tauri::command]
  pub async fn android_check_release(state: tauri::State<'_, State>) -> Result<Latest, String> {
    let result = fetch().await;
    *state.0.lock().unwrap() = Some(result.clone());
    result
  }
}

// Desktop: the app's WebView2 ignores browser-style (blob) downloads, so exports such as CSV files are
// written straight into the user's Downloads folder here. Never overwrites: "name (1).csv", "name (2).csv"…
#[cfg(desktop)]
#[tauri::command]
fn save_to_downloads(app: tauri::AppHandle, name: String, text: String) -> Result<String, String> {
  use tauri::Manager;
  let dir = app.path().download_dir().map_err(|e| e.to_string())?;
  let safe: String = name.chars().map(|c| if "\\/:*?\"<>|".contains(c) || c.is_control() { '_' } else { c }).collect();
  let safe = if safe.trim().is_empty() { "export.csv".to_string() } else { safe };
  let (stem, ext) = match safe.rfind('.') {
    Some(i) if i > 0 => (safe[..i].to_string(), safe[i..].to_string()),
    _ => (safe.clone(), String::new()),
  };
  let mut path = dir.join(&safe);
  let mut n = 1;
  while path.exists() {
    path = dir.join(format!("{stem} ({n}){ext}"));
    n += 1;
  }
  std::fs::write(&path, text.as_bytes()).map_err(|e| e.to_string())?;
  Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_opener::init());

  #[cfg(desktop)]
  let builder = builder.invoke_handler(tauri::generate_handler![save_to_downloads]);

  #[cfg(mobile)]
  let builder = builder
    .manage(android_update::State::default())
    .invoke_handler(tauri::generate_handler![android_update::android_latest_release, android_update::android_check_release]);

  builder
    .setup(|app| {
      // Online updates: the frontend checks GitHub Releases for a newer signed build.
      #[cfg(desktop)]
      app.handle().plugin(tauri_plugin_updater::Builder::new().build())?;

      #[cfg(mobile)]
      {
        use tauri::Manager;
        let handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
          let result = android_update::fetch().await;
          *handle.state::<android_update::State>().0.lock().unwrap() = Some(result);
        });
      }

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
