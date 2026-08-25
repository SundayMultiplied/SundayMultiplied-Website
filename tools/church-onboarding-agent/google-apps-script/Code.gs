/**
 * Sunday Multiplied onboarding CRM webhook.
 *
 * Deploy this as a Google Apps Script web app:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Script properties required:
 * - SPREADSHEET_ID
 * - CRM_WEBHOOK_SECRET
 */
const CRM_SHEET_NAME = "CRM";

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    const properties = PropertiesService.getScriptProperties();
    const expectedSecret = properties.getProperty("CRM_WEBHOOK_SECRET");
    const spreadsheetId = properties.getProperty("SPREADSHEET_ID");

    if (!expectedSecret || !spreadsheetId) {
      return json_({ error: "Apps Script properties are not configured." }, 500);
    }
    if (!payload.secret || payload.secret !== expectedSecret) {
      return json_({ error: "Unauthorized." }, 401);
    }
    if (payload.event !== "church_onboarding" || !payload.church || !payload.fields) {
      return json_({ error: "Invalid onboarding payload." }, 400);
    }

    const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(CRM_SHEET_NAME);
    if (!sheet) return json_({ error: 'CRM sheet not found.' }, 404);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const required = [
      "Church Name",
      "Church URL",
      "Owner",
      "Lead Source",
      "Onboarding Stage",
      "Onboarding Started",
      "Brand Profile",
      "Repository Workspace",
      "Onboarding Draft URL",
    ];
    const columns = {};
    required.forEach(function (name) {
      const index = headers.indexOf(name);
      if (index < 0) throw new Error('Missing CRM column: ' + name);
      columns[name] = index + 1;
    });

    const row = findOrCreateChurchRow_(sheet, columns, payload.church);
    const fields = payload.fields;
    setIfPresent_(sheet, row, columns["Onboarding Stage"], fields.stage);
    setIfBlank_(sheet, row, columns["Onboarding Started"], fields.startedAt);
    setIfPresent_(sheet, row, columns["Brand Profile"], fields.brandProfile);
    setIfPresent_(sheet, row, columns["Repository Workspace"], fields.repositoryWorkspace);
    setIfPresent_(sheet, row, columns["Onboarding Draft URL"], fields.onboardingDraftUrl);

    SpreadsheetApp.flush();
    return json_({ ok: true, row: row, stage: fields.stage }, 200);
  } catch (error) {
    console.error(error);
    return json_({ error: String(error && error.message ? error.message : error) }, 500);
  }
}

function findOrCreateChurchRow_(sheet, columns, church) {
  const lastRow = Math.max(sheet.getLastRow(), 1);
  if (lastRow > 1) {
    const names = sheet.getRange(2, columns["Church Name"], lastRow - 1, 1).getDisplayValues();
    const urls = sheet.getRange(2, columns["Church URL"], lastRow - 1, 1).getDisplayValues();
    const targetName = normalizeName_(church.name);
    const targetHost = normalizeHost_(church.website);

    for (let index = 0; index < names.length; index += 1) {
      if (targetHost && normalizeHost_(urls[index][0]) === targetHost) return index + 2;
    }
    for (let index = 0; index < names.length; index += 1) {
      if (targetName && normalizeName_(names[index][0]) === targetName) return index + 2;
    }
  }

  const row = lastRow + 1;
  sheet.getRange(row, columns["Church Name"]).setValue(church.name || church.slug);
  sheet.getRange(row, columns["Church URL"]).setValue(church.website || "");
  sheet.getRange(row, columns["Owner"]).setValue("Brian");
  sheet.getRange(row, columns["Lead Source"]).setValue("Onboarding Agent");
  return row;
}

function setIfPresent_(sheet, row, column, value) {
  if (value !== undefined && value !== null && value !== "") sheet.getRange(row, column).setValue(value);
}

function setIfBlank_(sheet, row, column, value) {
  if (value && !sheet.getRange(row, column).getValue()) sheet.getRange(row, column).setValue(value);
}

function normalizeName_(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeHost_(value) {
  try {
    return new URL(String(value || "")).hostname.toLowerCase().replace(/^www\./, "");
  } catch (_) {
    return String(value || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  }
}

function json_(body, status) {
  // Apps Script ContentService always returns HTTP 200; include the intended
  // status in JSON so callers still receive a useful diagnostic.
  body.status = status;
  return ContentService.createTextOutput(JSON.stringify(body)).setMimeType(ContentService.MimeType.JSON);
}
