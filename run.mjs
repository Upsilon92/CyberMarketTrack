import { analyzeFeed } from "./lib/rss-analyze.ts";
import { prisma } from "./lib/prisma.ts";
await prisma.feedItem.deleteMany(); // fresh
const start = Date.now();
const r = await analyzeFeed();
console.log(`durée: ${((Date.now()-start)/1000).toFixed(0)}s`);
console.log("rapport:", JSON.stringify(r, null, 1));
const props = await prisma.proposal.findMany({ where: { origin: "AUTO" }, orderBy: { createdAt: "desc" }, take: 6 });
console.log("\npropositions AUTO créées:");
props.forEach(p => console.log(` [${p.entityType}/${p.kind}]`, p.note?.split("\n")[0]?.slice(0,90), "| payload:", p.payload.slice(0,120)));
