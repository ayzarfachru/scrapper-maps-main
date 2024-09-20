import * as cheerio from "cheerio";
import puppeteerExtra from "puppeteer-extra";
import stealthPlugin from "puppeteer-extra-plugin-stealth";

export default async function searchGoogleMaps(query: string): Promise<any[]> {
  try {
    puppeteerExtra.use(stealthPlugin());

    const browser = await puppeteerExtra.launch({
      headless: false,
      // headless: "new",
      // devtools: true,
      executablePath: "", // your path here
    });

    const page = await browser.newPage();
    try {
      await page.goto(
        `https://www.google.com/maps/search/${query.split(" ").join("+")}`
      );
    } catch (error) {
      console.log("error going to page");
    }

    const html: string = await page.content();

    // get all a tag parent where a tag href includes /maps/place/
    const $ = cheerio.load(html);
    const parents: any[] = [];

    // const detailDiv = await page.$(`div[style*="width: 360px"]`);
    // const outerHTML = await page.evaluate(
    //   (element) => element?.outerHTML,
    //   detailDiv
    // );
    // console.log(detailDiv);

    const file = require("fs").promises;

    async function autoScroll(page: any): Promise<void> {
      await page.evaluate(async () => {
        const wrapper: any = document.querySelector('div[role="feed"]');

        await new Promise((resolve, reject) => {
          let totalHeight: number = 0;
          let distance: number = 1000;
          const scrollDelay: number = 3000;

          const timer = setInterval(async () => {
            const scrollHeightBefore: number = wrapper.scrollHeight;
            wrapper.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeightBefore) {
              totalHeight = 0;
              await new Promise((resolve) => setTimeout(resolve, scrollDelay));

              // Calculate scrollHeight after waiting
              const scrollHeightAfter: number = wrapper.scrollHeight;

              if (scrollHeightAfter > scrollHeightBefore) {
                // More content loaded, keep scrolling
                return;
              } else {
                // No more content loaded, stop scrolling
                clearInterval(timer);
                resolve();
              }
            }
          }, 700);
        });
      });
    }

    let divs: any = [];
    await autoScroll(page);
    divs = await page.$$(`a[href*="/maps/place/"]`);
    // divs = await page.$$("div.Nv2PK");
    console.log(divs.length);

    const business: any[] = [];

    let businesses: any = [];
    async function scrapDetail(div: any) {
      let data: any = {};
      // const detailUri = await page.evaluate((el) => el.href, div);

      const detailPage = await browser.newPage();
      const detailUriHandle = await div.getProperty("href");
      const detailUri = await detailUriHandle.jsonValue();

      await detailPage.goto(detailUri);

      const totalReview = await detailPage
        .$eval('div.F7nice span[aria-label*="ulasan"]', (el) =>
          el?.textContent
            ?.replace(/[()]/g, "")
            .replace(/[^\w\s]/g, "")
            .trim()
        )
        .catch(() => "0");

      if (parseInt(totalReview || "0") < 50) {
        await detailPage.close();
        return;
      }

      await detailPage.waitForSelector("h1.DUwDvf", { timeout: 3000 });
      // get data from first page
      data["title"] = await detailPage.$eval("h1.DUwDvf", (el) => {
        return Array.from(el.childNodes)
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent?.trim())
          .join(" ");
      });
      data["address"] = await detailPage.$eval("div.Io6YTe", (div) =>
        div?.textContent?.trim()
      );

      const isImageAvailable = await detailPage.$(".aoRNLd img");
      if (isImageAvailable) {
        data["image"] = await detailPage.$eval(".aoRNLd img", (img) => img.src);
      }
      data["rating"] = await detailPage
        .$eval('div.F7nice span[aria-hidden="true"]', (el) =>
          el?.textContent?.trim()
        )
        .catch(() => "0");
      data["total_review"] = totalReview;
      const isPriceAvailable = await detailPage.$(
        'span[aria-label^="Harga: Rp"]'
      );
      if (isPriceAvailable) {
        data["price"] = await detailPage.$eval(
          'span[aria-label^="Harga: Rp"]',
          (el) => el?.textContent?.replace("Harga: ", "").trim()
        );
      }

      const urlForLatLng = detailPage.url();
      const regex = /@([^/]+)\/data=/;
      const match = urlForLatLng.match(regex);
      if (match) {
        const dataUri = match[1];
        const splitData = dataUri.split(",");
        data["price"] = splitData[0];
        data["price"] = splitData[1];
      }

      const checkPhoneNumber = await detailPage.$(`
        button[data-tooltip="Salin nomor telepon"]
      `);
      if (checkPhoneNumber) {
        data["phone"] = await detailPage.$eval(
          `button[data-tooltip="Salin nomor telepon"]`,
          (div) => div?.textContent?.trim()
        );
      }
      data["uri"] = urlForLatLng;
      data["schedule"] = await detailPage.$$eval(`table.eK4R0e tr`, (rows) => {
        return rows
          .map((row: any) => {
            const cells = row.querySelectorAll("td");
            if (cells.length >= 2) {
              return {
                column1: cells[0]?.textContent?.trim(),
                column2: cells[1]?.textContent?.trim(),
              };
            }
            return null; // Ignore rows with less than 2 <td> elements
          })
          .filter((row: any) => row !== null); // Filter out null rows
      });

      const button: any = await detailPage.$(
        `button[role="tab"][aria-label^="Tentang"]`
      );
      await button.click();

      // second page
      await detailPage.waitForSelector("div.m6QErb", { timeout: 2000 });
      await detailPage.waitForSelector("h2.fontTitleSmall", {
        timeout: 2000,
      });
      const facility = await detailPage.$$eval(
        "h2.fontTitleSmall",
        (headers) => {
          return headers.map((header) => {
            const listItems =
              header.nextElementSibling?.querySelectorAll("li.hpLkke");
            const children: Array<Object> = [];
            listItems?.forEach((item) => {
              const img = item.querySelector("img")?.src; // Get img src
              const text = item.querySelector("span")?.textContent?.trim();
              children.push({ img, text });
            });
            return {
              parent: header.textContent?.trim(),
              children,
            };
          });
        }
      );

      data["description"] = await detailPage.$$eval("div.PbZDve span", (divs) =>
        divs.map((div) => div?.textContent?.trim()).join("\n")
      );
      data["facility"] = facility;
      businesses.push(data);

      const sortedKeys = Object.keys(data).sort();

      const sortedObj: any = {};
      sortedKeys.forEach((key: string) => {
        sortedObj[key] = data[key];
      });

      await detailPage.close();
    }

    browser.on("disconnected", async () => {
      await file.writeFile(
        `output/${query}.json`,
        JSON.stringify(businesses, null, 2)
      );
    });

    async function processArray() {
      for (const [index, div] of divs.entries()) {
        await scrapDetail(div).catch((error) => {
          console.log(error);
        });
        console.log(`Loading ${Math.floor((index / divs.length) * 100)}%`);
      }
      await file.writeFile(
        `output/${query}.json`,
        JSON.stringify(businesses, null, 2)
      );
    }
    await processArray();

    business.sort((a, b) => {
      if (a.stars && b.stars) {
        return b.stars - a.stars;
      } else {
        return 0;
      }
    });

    // await Promise.all(pages.map((page) => page.close()));
    await browser.close();
    console.log("browser closed");
    return business;
  } catch (error) {
    console.log("error at googleMaps", error);
    return [];
  }
}
