// Standalone test CLI. Its first read is from the environment created by Windows.
const valueAtEntry = process.env.HUHU_T192_SYNTHETIC_ONLY;
const { createHash } = require("node:crypto");
const { createInterface } = require("node:readline");
const expectedKeys = [
  "APPDATA","COMSPEC","HOME","HUHU_T192_EXPECTED","HUHU_T192_SYNTHETIC_ONLY",
  "LOCALAPPDATA","PATH","SYSTEMROOT","TEMP","TMP","USERPROFILE","WINDIR"
];
const exact = typeof valueAtEntry === "string" &&
  createHash("sha256").update(valueAtEntry, "utf8").digest("hex") === process.env.HUHU_T192_EXPECTED;
const missing = valueAtEntry === undefined;
if (missing) expectedKeys.splice(expectedKeys.indexOf("HUHU_T192_SYNTHETIC_ONLY"), 1);
const keysOK = Object.keys(process.env).map(k=>k.toUpperCase()).sort().join("|") === expectedKeys.sort().join("|");
const unicodeOK = !!valueAtEntry?.endsWith("-雪🧪");
const decoyAbsent = process.env.HUHU_T192_PARENT_ONLY === undefined;
const tty = [process.stdin,process.stdout,process.stderr].every(s=>s.isTTY === true);
console.log("ENTRY exact=%s missing=%s unicode=%s keys=%s decoyAbsent=%s tty=%s", exact, missing, unicodeOK, keysOK, decoyAbsent, tty);
if (!(keysOK && decoyAbsent && tty)) process.exit(18);
if (missing) process.exit(17);
if (!(exact && unicodeOK)) process.exit(19);
async function interact() {
if (process.argv[2] === "echo-control") {
  process.stderr.write(valueAtEntry.slice(0,21));
  await new Promise(resolve=>setTimeout(resolve,50));
  process.stdout.write("INTERLEAVED_PUBLIC_EVENT");
  await new Promise(resolve=>setTimeout(resolve,50));
  process.stderr.write(valueAtEntry.slice(21)+"\n");
} else if (process.argv.length !== 2) process.exit(20);
const reader=createInterface({input:process.stdin,terminal:false});
process.stdout.write("CLI_INPUT> ");
reader.once("line",line=>{
  if(line!=="ping") process.exit(21);
  console.log("CLI_PONG");
  // On Windows the original WriteStream can retain its initial cached dimensions.
  const currentConsole=new (require("node:tty").WriteStream)(1);
  console.log("CLI_SIZE %d %d",...currentConsole.getWindowSize());
  reader.close();process.stdin.pause();
});
}
interact().catch(()=>process.exit(22));
