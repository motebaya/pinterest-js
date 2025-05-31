## Pinterest-JS

<div align="center">
Pinterest media downloader tool

[![nodejs](https://img.shields.io/badge/nodeJs-22.14.0-green?logo=node.js&logoColor=green)](https://nodejs.org)
[![pinterest](https://img.shields.io/badge/pinterest-downloader-red?logo=pinterest&logoColor=white)](https://github.com/motebaya/pinterest-js)
[![argparse](https://img.shields.io/badge/argparse-2.0.1-blue?logo=python&logoColor=white)](https://www.npmjs.com/package/argparse)
[![axios](https://img.shields.io/badge/axios-1.9.0-blue?logo=axios&logoColor=white)](https://axios-http.com)
[![axios-logger](https://img.shields.io/badge/axios--logger-2.8.1-blue?logo=axios&logoColor=white)](https://www.npmjs.com/package/axios-logger)
[![chalk](https://img.shields.io/badge/chalk-5.4.1-yellow?logo=javascript&logoColor=white)](https://www.npmjs.com/package/chalk)
[![cheerio](https://img.shields.io/badge/cheerio-1.0.0-green?logo=cheerio&logoColor=white)](https://cheerio.js.org)
[![cli-progress](https://img.shields.io/badge/cli--progress-3.12.0-blue?logo=javascript&logoColor=white)](https://www.npmjs.com/package/cli-progress)
[![dotenv](https://img.shields.io/badge/dotenv-16.5.0-green?logo=dotenv&logoColor=white)](https://www.npmjs.com/package/dotenv)
[![node-telegram-bot-api](https://img.shields.io/badge/node--telegram--bot--api-0.66.0-2CA5E0?logo=telegram&logoColor=white)](https://www.npmjs.com/package/node-telegram-bot-api)
[![sharp](https://img.shields.io/badge/sharp-0.34.2-green?logo=sharp&logoColor=white)](https://sharp.pixelplumbing.com)
[![winston](https://img.shields.io/badge/winston-3.17.0-blue?logo=winston&logoColor=white)](https://www.npmjs.com/package/winston)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?logo=github)](https://opensource.org/licenses/MIT)

</div>

NodeJS CLI tool for downloading Pinterest media such as images and videos using web scraping methods.

### Features:

- Command-line interface (CLI) for easy usage
- Support for downloading both images and videos
- Metadata extraction and caching
- Progress tracking with visual feedback
- Organized output structure by username
- Support for bulk downloads from user profiles
- Configurable verbose logging

### Features list:

| Feature          | Description                                  |
| ---------------- | -------------------------------------------- |
| Image Download   | Download high-quality images from Pinterest  |
| Video Download   | Download videos in 720p quality              |
| User Profiles    | Download all media from a user's profile     |
| Metadata Cache   | Save and reuse metadata for faster downloads |
| Progress Bar     | Visual progress tracking for downloads       |
| Organized Output | Files organized by username and media type   |

### Install:

```bash
git clone https://github.com/motebaya/pinterest-js
cd pinterest-js
npm install
```

### Usage (CLI):

```bash
$ node cli
usage: cli.js [-h] [-u] [-p] [-t] [-c] [-m] [-o] [-V]

    Pinterest CLI downloader
 © Copyright: @github.com/motebaya - 2025

optional arguments:
  -h, --help      show this help message and exit
  -u, --username  pinterest username
  -p, --pin       pinterest post url or id
  -t, --type      type of media to download, default: image. (image, video)
  -c, --cache     using metadata from cache, <username> or <pinId> if exists
  -m, --metadata  save metadata to <output>/<id>/metadata.json
  -o, --overwrite overwrite existing files

additional:
  -V, --verbose   verbose output to console
```

- `-u`, `--username`: Pinterest username to download from
- `-p`, `--pin`: Pinterest post URL or ID to download
- `-t`, `--type`: Media type to download (image or video)
- `-c`, `--cache`: Use cached metadata for faster downloads
- `-m`, `--metadata`: Save metadata alongside downloaded files
- `-o`, `--overwrite`: Overwrite existing files
- `-V`, `--verbose`: Enable detailed console output

> [!note]
> Downloaded media will be saved in the `pinterest-downloader-output` directory, organized by username and media type.
> Metadata files are stored in a separate `metadata` subdirectory for each user.

### Output Structure:

```
pinterest-downloader-output/
├── @username/
│   ├── images/
│   │   ├── metadata/
│   │   │   └── [pinId].json
│   │   └── [image files]
│   └── videos/
│       ├── metadata/
│       │   └── [pinId].json
│       └── [video files]
```

### Dependencies:

- axios: HTTP client for making requests
- cheerio: HTML parsing and manipulation
- sharp: Image processing
- cli-progress: Progress bar visualization
- winston: Logging
- argparse: Command-line argument parsing

## License

This project is licensed under the [ISC License](LICENSE).
