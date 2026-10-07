/**
 * TDF Dose Calculator — Google Apps Script web app.
 *
 * Files in this project:
 *   Code.gs     this file (server side)
 *   Index.html  the page
 *   Tdf.html    the calculation library (TDF formulas), pulled in by include('Tdf')
 *
 * Deploy: Deploy → New deployment → Web app.
 * Open a tab directly with ?tab=frac | gap | brachy | ref
 */
function doGet(e) {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('TDF Dose Calculator')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Inserts the contents of another HTML file in the project (used for Tdf.html). */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
