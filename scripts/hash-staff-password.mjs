import { emitKeypressEvents } from "node:readline";
import { createInterface } from "node:readline/promises";
import { hashStaffPassword } from "../lib/staff-password.mjs";

if (process.argv.length > 2) {
  console.error("Password must be entered at the prompt, never as an argument.");
  process.exit(1);
}

async function hiddenPassword() {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
    const readline = createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
    });
    const value = await readline.question("Password: ");
    readline.close();
    return value;
  }

  process.stderr.write("Password: ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = () => {
      process.stdin.off("keypress", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write("\n");
      resolve(value);
    };
    const onKey = (character, key) => {
      if (key?.ctrl && key.name === "c") {
        process.stdin.off("keypress", onKey);
        process.stdin.setRawMode(false);
        reject(new Error("PASSWORD_PROMPT_CANCELLED"));
        return;
      }
      if (key?.name === "return" || key?.name === "enter") {
        finish();
        return;
      }
      if (key?.name === "backspace") {
        value = value.slice(0, -1);
        return;
      }
      if (typeof character === "string" && !key?.ctrl && !key?.meta) {
        value += character;
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

const password = await hiddenPassword();
console.log(await hashStaffPassword(password));
