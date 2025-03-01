const fs = require('fs');
const path = require('path');

const cheerio = require('cheerio');
// Path to your BoatNetBuddy cache folder
const cacheFolder = path.join(__dirname, 'cached_pages');

// Function to read and list all files in the cache
function listCacheFiles() {
  const files = fs.readdirSync(cacheFolder);
  return files.filter(file => file.endsWith('.html'));
}

// Example: List all cached HTML files
const cachedFiles = listCacheFiles();
  
//Loop through each file
cachedFiles.forEach(file => {
  console.log(`CHECKING: ${file}`);
  const filePath = path.join(cacheFolder, file);
  //Only process BBC files (for now)
  if( !file.includes("bbc_") ) return;
  let html = fs.readFileSync(filePath, 'utf8');
  let modifiedHTML = modifyLinksInHTML(html);  
  fs.writeFileSync(filePath, modifiedHTML, 'utf8');
  html = null;
  modifiedHTML = null;
  console.log(`Processed file\t${file}`);
});

//console.log('Cached Files:', cachedFiles);


//Check each link to see if it formatted correctly
function formatBBCLink(link) {
  let $ = cheerio.load(link);
  let href = $(link).attr("href");

  //Logic to validate link
  let new_link = ""
  if(href && href.startsWith("/")) {
    //console.log(`\t\tRELATIVE: \t${href}`);
    new_link = "bbc/bbc_https___bbc_co_uk_" + href.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
    //console.log(`\tREALATIVE: \t${href}\n\t\t\tChanged to:\t${new_link}`);
  }else if( href && href.startsWith("https") ) {
    //If its an absolute link convert it to the following format@
    //bbc/bbc_https___....
    new_link = "bbc/bbc_" + href.replace(/[^a-zA-Z0-9]/g, "_") + ".html"
    //console.log(`\tABSOLUTE: \t${href}\n\t\t\tChanged to:\t${new_link}`);
  }else {
    new_link = "bbc/bbc_404.html";
  }
  let check_link = new_link.substr(4);
  //console.log(check_link);
  if( cachedFiles.includes(check_link)) console.log("\t\tSUCCESS");
  $ = null;
  return new_link;
}

function getCacheFileName(url) {
  const prefix = url.includes("theguardian.com") ? "guardian_" : "bbc_";
  return prefix + url.replace(/[^a-zA-Z0-9]/g, "_") + ".html";
}

//Find all links within the html.
function findLinksInHTML(html) {
  let $ = cheerio.load(html);
  let goodLinks = [];
  let badLinks = [];
  let links = [];
  $('a').each((i, link) => {
    links.push(link);
  })
  $ = null;
  return links;
}

function modifyLinksInHTML(html) {
  //console.log("Modifying HTML now");
  let $ = cheerio.load(html);
  $('a').each((i, link) => {
    //console.log("A found");
    console.log(`\tLink was\t${link}`);
    let new_link = formatBBCLink(link);
    $(link).attr('href', new_link);
    console.log(`\tIs now\t${new_link}`);
  });
  return $.html();
}

// Function to modify hrefs in HTML
function modifyLinksInHTMLOLD(html) {
  const $ = cheerio.load(html);

  // Example 1: Append a query string to all hrefs
  $('a').each((i, link) => {
    let href = $(link).attr('href');
    if (href && !href.startsWith('#')) {
      $(link).attr('href', `${href}?source=boatnet`);
    }
  });

  // Example 2: Add target="_blank" to external links
  $('a').each((i, link) => {
    let href = $(link).attr('href');
    if (href && href.startsWith('http')) {
      $(link).attr('target', '_blank');
    }
  });

  // Example 3: Change all relative links to absolute
  $('a').each((i, link) => {
    let href = $(link).attr('href');
    if (href && href.startsWith('/')) {
      $(link).attr('href', `https://boatnet.local${href}`);
    }
  });

  return $.html();
}
