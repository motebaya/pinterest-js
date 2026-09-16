/**
 * test.js - Backward-compatibility adapter.
 * Re-exports from src/core/extractors/pinterest/Pinterest.js
 */
import { createLogger } from "./src/logger/index.js";

const log = createLogger({ level: "debug" });
log.info("This is an info message");
log.debug("This is a debug message");
log.warn("This is a warning message");
log.error("This is an error message");

// (async () => {
// const instance = new Pinterest({ verbose: true });
// let board = await instance.getUserBoard({
// username: "kiyosama_kr",
// username: "wendihariyanto49",
// });
// console.log(board);
// fs.writeFileSync("board.json", JSON.stringify(board));
// let board = await instance.getUserBoardSection({
//   username: "wendihariyanto49",
//   boardId: "1021332090435057038",
//   boardSlug: "24anime-characters-8",
// });
// console.log(board);
// fs.writeFileSync("board_section.json", JSON.stringify(board));
// let board = await instance.getBoardSectionContent({
//   username: "wendihariyanto49",
//   slugBoard: "24anime-characters-8",
//   slugSection: "eiko-tsukimi",
//   sectionId: "5437839793545338619",
// });
// console.log(board);
// fs.writeFileSync("board_section_content.json", JSON.stringify(board));
// let board = await instance.getUserBoardContent({
//   username: "kiyosama_kr",
//   boardId: "750130950374618352",
//   boardSlug: "hls",
// });
// console.log(board);
// fs.writeFileSync("kiyosama.json", JSON.stringify(board));
// })();
