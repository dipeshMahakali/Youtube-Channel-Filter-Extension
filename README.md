# 📺 YouTube Channel Filter & Video Extractor

A robust Chrome extension designed to identify, extract, and automate video playback from specific YouTube channels. Whether you're filtering out noise or aggregating content for research, this tool streamlines the process directly from your browser.

---

## 🚀 Key Features

* **Smart Video Extraction:** Gathers all visible video data from your current screen with a single click.
* **Automated Playback:** Once extracted, the extension can automatically start playing through the gathered list.
* **Channel-Specific Filtering:** Logic designed to prioritize or filter content based on predefined channel contexts.
* **Shorts Detection:** Specialized handling for YouTube Shorts to ensure they are identified and managed correctly.
* **URL Normalization:** Cleans and formats playlist and video URLs for better stability and sharing.

---

## 🛠️ How It Works

1.  **Navigate:** Open any YouTube page (Home, Subscriptions, or a specific Channel).
2.  **Activate:** Click the **Extension Icon** in your Chrome toolbar to open the dropdown.
3.  **Gather:** Click the **"Gather Videos"** button. The extension will scan the DOM for all visible video elements.
4.  **Autoplay:** The extension will then transition into an automated playback mode, processing the extracted videos based on your filter settings.

---

## 📂 Project Structure

| File | Description |
| :--- | :--- |
| `manifest.json` | Extension metadata and permissions (v3). |
| `content.js` | The engine that scans the YouTube UI and detects "Shorts". |
| `popup.js` | Handles the "Gather Videos" click event and UI logic. |
| `popup.html` | The main user interface for the extension dropdown. |
| `popup.css` | Custom styling for a clean, modern interface. |
| `icons/` | Branding assets in 16x16, 48x48, and 128x128 sizes. |

---

## 🔧 Installation

1.  **Clone the Repository:**
    ```bash
    git clone [https://github.com/dipeshMahakal/Youtube-Channel-Filter-Extension.git](https://github.com/dipeshMahakal/Youtube-Channel-Filter-Extension.git)
    ```
2.  **Open Extensions Page:**
    Go to `chrome://extensions/` in your browser.
3.  **Developer Mode:**
    Enable **"Developer mode"** in the top-right corner.
4.  **Load Extension:**
    Click **"Load unpacked"** and select the folder containing these files.

---

## 📝 Commit History Note
The latest updates (`feat: Enhance video playback stability...`) improved how the script handles context switching and ensures that the "Gather" function doesn't break when YouTube dynamically loads new content.

---

## 👤 Author

**Dipesh Patel**
* GitHub: [@dipeshMahakal](https://github.com/dipeshMahakal)

---

## 📄 License
This project is for educational/personal use. Please ensure you comply with YouTube's Terms of Service when using extraction tools.
