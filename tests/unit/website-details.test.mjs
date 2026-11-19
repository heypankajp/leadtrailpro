import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { addressInText, cityInAddress, contactPageLinks, extractWebsiteDetails, guessIndustry, normalizeWebsite } from "../../src/features/contacts/websiteDetails.ts";

describe("company details from its website (request of November 19, 2026)", () => {
  test("JSON-LD gives the name, the address, the town and the industry of its kind", () => {
    const html = `<html><head><title>Home | Northstar Dental</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"Northstar site"},
      {"@type":"Dentist","name":"Northstar Dental Care","address":{"@type":"PostalAddress","streetAddress":"12 King St W","addressLocality":"Barrie","addressRegion":"ON","postalCode":"L4M 1A1","addressCountry":"CA"}}]}</script>
      </head><body></body></html>`;
    const details = extractWebsiteDetails(html, "https://www.northstardental.example/home");
    assert.equal(details.name, "Northstar Dental Care");
    assert.equal(details.address, "12 King St W, Barrie, ON L4M 1A1, CA");
    assert.equal(details.city, "Barrie");
    assert.equal(details.industry, "Healthcare");
    assert.equal(details.website, "https://www.northstardental.example");
  });

  test("without structured data: og:site_name, the description's words and an address in the text", () => {
    const html = `<html><head><title>Welcome - Maple Freight</title>
      <meta property="og:site_name" content="Maple Freight &amp; Logistics">
      <meta name="description" content="Trucking, freight and warehousing across Ontario. Your supply chain partner."></head>
      <body><footer><p>Maple Freight</p><p>250 Industrial Pkwy, Unit 4<br>Aurora, ON L4G 3V2</p></footer></body></html>`;
    const details = extractWebsiteDetails(html, "https://maplefreight.example/");
    assert.equal(details.name, "Maple Freight & Logistics");
    assert.equal(details.industry, "Logistics & Transportation");
    assert.equal(details.address, "250 Industrial Pkwy, Unit 4, Aurora, ON L4G 3V2");
    assert.equal(details.city, "Aurora");
  });

  test("the name falls back to the title part that matches the domain, not Home", () => {
    const details = extractWebsiteDetails("<title>Home | Acme Robotics</title>", "https://acmerobotics.example");
    assert.equal(details.name, "Acme Robotics");
    assert.equal(details.address, "");
  });

  test("addresses: Canadian and US forms, and the town before the province or state", () => {
    assert.equal(addressInText("Visit us at 200 Bay Street, Suite 1200, Toronto, ON M5J 2J2 today"), "200 Bay Street, Suite 1200, Toronto, ON M5J 2J2");
    assert.equal(addressInText("HQ: 1 Main St, Springfield, IL 62701"), "1 Main St, Springfield, IL 62701");
    assert.equal(addressInText("Call 1-800-555-0100 or email us"), "");
    assert.equal(cityInAddress("200 Bay Street, Suite 1200, Toronto, ON M5J 2J2"), "Toronto");
  });

  test("industry: a schema.org kind first, else the words used most, else nothing", () => {
    assert.equal(guessIndustry(["LegalService"], "software"), "Legal Services");
    assert.equal(guessIndustry([], "Staffing and recruitment agency: talent acquisition for employers"), "Staffing & Recruiting");
    assert.equal(guessIndustry([], "Lorem ipsum dolor"), "");
  });

  test("contact pages on the same site come first; other sites are skipped", () => {
    const html = `<a href="/about-us">About</a><a href="https://other.example/contact">Elsewhere</a><a href="/contact#form">Contact us</a><a href="mailto:a@b.c">Mail</a>`;
    assert.deepEqual(contactPageLinks(html, "https://www.acme.example/"), ["https://www.acme.example/contact", "https://www.acme.example/about-us"]);
  });

  test("a website typed without https:// is accepted; other schemes and bare words are not", () => {
    assert.equal(normalizeWebsite("acme.example")?.href, "https://acme.example/");
    assert.equal(normalizeWebsite("ftp://acme.example"), null);
    assert.equal(normalizeWebsite("acme"), null);
  });
});

test("a title that is only a tagline gives way to the logo text or the domain", () => {
  const tagline = "<title>Full-Time Jobs, Temp Jobs, Staffing &amp; Recruitment Agency</title>";
  assert.equal(extractWebsiteDetails(`${tagline}<svg><title>randstad</title></svg>`, "https://www.randstad.example").name, "Randstad");
  assert.equal(extractWebsiteDetails(`${tagline}<img src="l.png" alt="Hirewell Logo">`, "https://hirewell.example").name, "Hirewell");
  assert.equal(extractWebsiteDetails(tagline, "https://brightpath.example").name, "Brightpath");
});

test("the country: the page's own, else the address, else the domain", async () => {
  const { countryOfAddress, countryOfDomain } = await import("../../src/features/contacts/websiteDetails.ts");
  assert.equal(countryOfAddress("200 Bay Street, Toronto, ON M5J 2J2"), "Canada");
  assert.equal(countryOfAddress("1 Main St, Springfield, IL 62701"), "United States");
  assert.equal(countryOfAddress("10 Downing Street, London, United Kingdom"), "United Kingdom");
  assert.equal(countryOfAddress("Chicago, IL"), "");
  assert.equal(countryOfDomain("acme.ca"), "Canada");
  assert.equal(countryOfDomain("acme.co.uk"), "United Kingdom");
  assert.equal(countryOfDomain("acme.com"), "");
  assert.equal(countryOfDomain("acme.io"), "");
  const jsonLd = (country) => `<script type="application/ld+json">{"@type":"Organization","name":"Acme","address":{"streetAddress":"1 A St","addressLocality":"Austin","addressCountry":${JSON.stringify(country)}}}</script>`;
  assert.equal(extractWebsiteDetails(jsonLd("US"), "https://acme.example").country, "United States");
  assert.equal(extractWebsiteDetails(jsonLd({ "@type": "Country", name: "Canada" }), "https://acme.example").country, "Canada");
  assert.equal(extractWebsiteDetails("<title>Acme</title>", "https://acme.de").country, "Germany");
});

test("contact pages: the head office first, addresses without a postal code, script data and Google Maps links", async () => {
  const { addressInText, scriptText, mapsAddress } = await import("../../src/features/contacts/websiteDetails.ts");
  assert.equal(addressInText("Branch: 5 Elm St, Barrie, ON L4M 1A1\nHead Office: 100 King Street West, Suite 500, Toronto, ON M5X 1A9"), "100 King Street West, Suite 500, Toronto, ON M5X 1A9");
  assert.equal(addressInText("Visit 32575 Simon Avenue, Abbotsford, British Columbia today"), "32575 Simon Avenue, Abbotsford, British Columbia");
  const data = `<script>window.offices = {"html":"45890 Hocking Ave Suite 302\u003cbr\u003eChilliwack, BC V2P 1B3"}</script>`;
  assert.equal(addressInText(scriptText(data)), "45890 Hocking Ave Suite 302, Chilliwack, BC V2P 1B3");
  assert.equal(mapsAddress(`<a href="https://www.google.com/maps/place/250+Industrial+Pkwy,+Aurora,+ON/@43.9,-79.4">Map</a>`), "250 Industrial Pkwy, Aurora, ON");
  assert.equal(mapsAddress(`<a href="https://google.com/maps/place/43.768549,-79.413089">Map</a>`), "");
});

test("Google Maps: the place with the company's website, else its exact name; a namesake is not taken", async () => {
  const { pickPlace, sameSite, countryOfFormattedAddress } = await import("../../src/features/contacts/websiteDetails.ts");
  const places = [
    { name: "Acme Bakery", address: "1 Main St, Austin, TX 78701, USA", website: "https://acmebakery.example" },
    { name: "Acme Robotics Inc.", address: "200 Bay St, Toronto, ON M5J 2J2, Canada", website: "https://www.acmerobotics.example/locations/toronto" },
  ];
  assert.equal(pickPlace(places, "https://acmerobotics.example", "Acme").address, "200 Bay St, Toronto, ON M5J 2J2, Canada");
  assert.equal(pickPlace(places.map((place) => ({ ...place, website: "" })), "https://acmerobotics.example", "Acme Robotics").name, "Acme Robotics Inc.");
  assert.equal(pickPlace(places.map((place) => ({ ...place, website: "" })), "https://acme.example", "Acme Holdings"), null);
  assert.ok(sameSite("https://careers.acme.ca/jobs", "acme.ca"));
  assert.ok(!sameSite("https://notacme.ca", "acme.ca"));
  assert.equal(countryOfFormattedAddress("1 Main St, Austin, TX 78701, USA"), "United States");
  assert.equal(countryOfFormattedAddress("200 Bay St, Toronto, ON M5J 2J2, Canada"), "Canada");
});
