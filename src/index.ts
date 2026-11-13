import { config } from "./config.js";
import { createApp } from "./server/app.js";
import { openStore } from "./store/db.js";

const store = openStore(config.dbPath);
const app = createApp(store);

app.listen(config.port, () => {
  console.log(JSON.stringify({ level: "ready", url: `http://localhost:${config.port}` }));
});
