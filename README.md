# ST2110 BCC - Broadcast Control Center

A modern, browser-based Broadcast Control Center (BCC) for SMPTE ST 2110 video routing using NMOS IS-04/IS-05 APIs.

![ST2110 BCC](https://img.shields.io/badge/NMOS-IS--04%20%7C%20IS--05-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![JavaScript](https://img.shields.io/badge/javascript-ES6+-yellow)

## Features

- **Pure Browser-Based**: No server required - runs entirely in your browser using JavaScript
- **NMOS IS-04/IS-05 Support**: Full implementation of NMOS discovery and connection management
- **ST2110-7 Compatible**: Supports both redundant (primary/secondary) and non-redundant streams
- **Auto-Discovery**: Automatically detects IS-05 endpoints from IS-04 device controls
- **Local Storage**: Saves your nodes and patch history in browser localStorage
- **Modern UI**: Clean, responsive interface with dark theme
- **Patch History**: Track all your routing operations

## Quick Start

### Option 1: Use GitHub Pages (Recommended)

Simply visit: **[https://YOUR-USERNAME.github.io/nmos-patch-gui/](https://YOUR-USERNAME.github.io/nmos-patch-gui/)**

### Option 2: Run Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR-USERNAME/nmos-patch-gui.git
   cd nmos-patch-gui
   ```

2. Serve with any HTTP server:
   ```bash
   # Python 3
   python3 -m http.server 8000

   # Node.js (with http-server)
   npx http-server -p 8000
   ```

3. Open `http://localhost:8000` in your browser

## Usage

### 1. Add an NMOS Node

1. Click **"Add Node"** button
2. Enter a friendly name (e.g., "Studio A Camera")
3. Enter the IS-04 URL (e.g., `http://192.168.1.10:3000`)
4. Click **"Add Node"**

The application will automatically:
- Discover IS-05 endpoint from device controls
- Load all available senders and receivers
- Cache the information in browser storage

### 2. Route a Signal

1. Select a node from the dropdown
2. Click a **Sender** from the left panel
3. Click a **Receiver** from the right panel
4. Click the **TAKE** button

The application will:
- Fetch SDP from the sender
- Convert to IS-05 format (handling ST2110-7 if needed)
- PATCH the receiver
- Display success/failure status

### 3. View History

Click the **"History"** button to see all your previous patch operations, including timestamps and success/failure status.

## Architecture

### Technologies Used

- **Pure JavaScript (ES6 Modules)**: No frameworks, minimal dependencies
- **LocalStorage API**: Persistent data storage
- **Fetch API**: NMOS API communication
- **CSS Grid/Flexbox**: Responsive layout

### File Structure

```
nmos-patch-gui/
├── index.html          # Main application HTML
├── css/
│   └── style.css       # Modern dark theme styles
├── js/
│   ├── app.js          # Main application logic
│   ├── nmos-api.js     # NMOS IS-04/IS-05 client
│   ├── sdp-parser.js   # SDP to IS-05 converter (ST2110-7 support)
│   └── storage.js      # LocalStorage manager
└── README.md
```

### NMOS API Flow

```
IS-04 Discovery:
  GET /x-nmos/node/                    → Get API version
  GET /x-nmos/node/{ver}/senders/      → List senders
  GET /x-nmos/node/{ver}/receivers/    → List receivers
  GET /x-nmos/node/{ver}/devices/{id}  → Get IS-05 endpoint

IS-05 Connection:
  GET /x-nmos/connection/              → Get API version
  PATCH /x-nmos/connection/{ver}/single/receivers/{id}/staged
    → Test path (with/without trailing slash)
  GET /x-nmos/connection/{ver}/single/receivers/{id}/staged
    → Get receiver port count
  PATCH /x-nmos/connection/{ver}/single/receivers/{id}/staged
    → Execute patch with SDP
  GET /x-nmos/connection/{ver}/single/receivers/{id}/active
    → Verify connection
```

## CORS Configuration

This application makes direct HTTP requests to NMOS devices. You may need to enable CORS on your NMOS nodes:

### For Testing (NOT for production):
```bash
# Example: Chrome with CORS disabled (macOS)
open -na "Google Chrome" --args --disable-web-security --user-data-dir=/tmp/chrome_dev
```

### For Production:
Configure your NMOS device to send:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, PATCH
Access-Control-Allow-Headers: Content-Type
```

## ST2110-7 Support

The application automatically detects and handles ST2110-7 redundant streams:

- **Primary/Secondary Detection**: Parses `a=mid:PRIMARY` and `a=mid:SECONDARY` from SDP
- **Port Count Adaptation**: Adjusts `transport_params` array based on receiver capabilities
- **Flexible Parsing**: Handles both redundant and non-redundant streams

## Browser Compatibility

- ✅ Chrome/Edge (Recommended)
- ✅ Firefox
- ✅ Safari 14+
- ❌ Internet Explorer (Not supported)

Requires modern browser with ES6 module support.

## Troubleshooting

### "Failed to fetch" Error

**Cause**: CORS policy blocking request
**Solution**: Enable CORS on your NMOS device or use a CORS proxy

### "IS-05 endpoint not found"

**Cause**: Device doesn't advertise IS-05 in controls
**Solution**: Application will attempt to guess port (IS-04 port + 1)

### Patch fails with 400/500 error

**Cause**: SDP format incompatible with receiver
**Solution**: Check browser console for details. May need manual SDP adjustment.

## Development

### Adding Features

The codebase is modular and easy to extend:

- **Add new UI**: Modify `index.html` and `css/style.css`
- **Extend NMOS API**: Edit `js/nmos-api.js`
- **Modify SDP parsing**: Update `js/sdp-parser.js`
- **Change storage**: Edit `js/storage.js`

### Future Enhancements

- [ ] RDS (DNS-SD) auto-discovery
- [ ] Batch patching (multiple receivers)
- [ ] Export/import configuration
- [ ] WebSocket support for real-time updates
- [ ] Dark/Light theme toggle

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - See [LICENSE](LICENSE) file for details

## Credits

Developed for broadcast engineers who need quick NMOS patching without complex software installations.

Based on NMOS IS-04 v1.3 and IS-05 v1.1 specifications from AMWA.

---

**Note**: This tool is for authorized network use only. Always ensure you have permission to modify routing configurations on your broadcast network.

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

---

Made with ❤️ for the broadcast community
