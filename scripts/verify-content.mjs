import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { JSDOM } from "jsdom";

const pages = [
  "index.html",
  "guides/index.html",
  "guides/fulfillment.html",
  "guides/sku-mapping.html",
  "guides/inventory.html",
  "guides/returns.html",
  "about.html",
  "privacy.html",
  "404.html",
];
const root = path.resolve("dist");
const publisher = "ca-pub-6732464360142866";
let checkedLinks = 0;
for (const file of pages) {
  const html = await readFile(path.join(root, file), "utf8");
  const document = new JSDOM(html).window.document;
  assert.equal(
    document
      .querySelector('meta[name="google-adsense-account"]')
      ?.getAttribute("content"),
    publisher,
    `${file}: ownership marker`,
  );
  assert.ok(
    document.querySelector("title")?.textContent?.trim(),
    `${file}: title`,
  );
  assert.ok(
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim(),
    `${file}: description`,
  );
  assert.ok(
    !html.includes("adsbygoogle.js"),
    `${file}: ads stay disabled during review`,
  );
  if (file !== "index.html") {
    assert.equal(
      document.querySelectorAll("h1").length,
      1,
      `${file}: one readable heading`,
    );
    assert.ok(
      document.querySelector("main")?.textContent?.trim(),
      `${file}: server-readable content`,
    );
  }
  for (const element of document.querySelectorAll(
    'a[href], link[rel="stylesheet"][href], script[src]',
  )) {
    const href = element.getAttribute("href") ?? element.getAttribute("src");
    if (!href || /^(?:https?:|mailto:)/.test(href)) continue;
    const [pathname, fragment] = href.split("#");
    let target = pathname
      ? path.resolve(
          path.dirname(path.join(root, file)),
          decodeURIComponent(pathname),
        )
      : path.join(root, file);
    assert.ok(
      target === root || target.startsWith(`${root}${path.sep}`),
      `${file}: path stays in build`,
    );
    if ((await stat(target)).isDirectory())
      target = path.join(target, "index.html");
    assert.ok(
      (await stat(target)).isFile(),
      `${file}: local target ${pathname}`,
    );
    if (fragment && !fragment.startsWith("/")) {
      const destination = new JSDOM(await readFile(target, "utf8")).window
        .document;
      assert.ok(
        destination.getElementById(decodeURIComponent(fragment)),
        `${file}: anchor ${fragment}`,
      );
    }
    checkedLinks++;
  }
}
assert.equal(
  await readFile(path.join(root, "ads.txt"), "utf8"),
  "google.com, pub-6732464360142866, DIRECT, f08c47fec0942fa0\n",
);
console.log(
  `Verified ${pages.length} HTML pages, ${checkedLinks} local links/assets, ownership metadata and ads disabled.`,
);
