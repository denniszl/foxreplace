/** ***** BEGIN LICENSE BLOCK *****
 *
 *  Copyright (C) 2017 Marc Ruiz Altisent. All rights reserved.
 *
 *  This file is part of FoxReplace.
 *
 *  FoxReplace is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software
 *  Foundation, either version 3 of the License, or (at your option) any later version.
 *
 *  FoxReplace is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 *  A PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License along with FoxReplace. If not, see <http://www.gnu.org/licenses/>.
 *
 *  ***** END LICENSE BLOCK ***** */

// Port to communicate with the legacy extension
let legacyPort = browser.runtime.connect();

// Listen to messages from the legacy extension
legacyPort.onMessage.addListener(message => {
  switch (message.key) {
    case "replace":
      replaceCurrentTab(message);
      break;
    case "autoReplaceOnLoad":
      storage.setPrefs({
        autoReplaceOnLoad: message.value
      });
      break;
    case "showOptions":
      browser.runtime.openOptionsPage();
      break;
  }
});

// Listen to messages from other parts of the WebExtension
browser.runtime.onMessage.addListener(message => {
  switch (message.key) {
    case "replaceWithList":
      replaceCurrentTab(message);
      break;
    case "showHelp":
      legacyPort.postMessage(message);
      break;
  }
});

// Migrate data from the legacy extension
storage.hasData().then(has => {
  let message = {
    key: "migrateData",
    force: !has
  };
  browser.runtime.sendMessage(message).then(response => browser.storage.local.set(response));
});

/**
 * Applies the substitution list contained in aMessage to the current tab.
 */
function replaceCurrentTab(aMessage) {
  browser.tabs.query({
    currentWindow: true,
    active: true
  }).then(tabs => {
    if (tabs[0]) browser.tabs.sendMessage(tabs[0].id, aMessage);
  });
}

// Initialize things
storage.getPrefs().then(prefs => {
  if (prefs.enableSubscription) subscription.start(prefs.subscriptionUrl, prefs.subscriptionPeriod);

  if (prefs.autoReplacePeriodically) periodicReplace.start(prefs.autoReplacePeriod);

  legacyPort.postMessage({
    key: "autoReplaceOnLoad",
    value: prefs.autoReplaceOnLoad
  });
});

// Update things
browser.storage.onChanged.addListener(changes => {
  // TODO should check which keys are in changes, but with the current implementation it always contains all keys
  storage.getPrefs().then(prefs => {
    if (prefs.enableSubscription) subscription.restart(prefs.subscriptionUrl, prefs.subscriptionPeriod);
    else subscription.stop();

    if (prefs.autoReplacePeriodically) periodicReplace.restart(prefs.autoReplacePeriod);
    else periodicReplace.stop();

    legacyPort.postMessage({
      key: "autoReplaceOnLoad",
      value: prefs.autoReplaceOnLoad
    });
  });
});

// Listen for periodic replace alarm
browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name == periodicReplace.alarmName) {
    Promise.all([storage.getEnabledGroups(), storage.getPrefs()])
      .then(([list, prefs]) => {
        if (list.length > 0) {
          replaceCurrentTab({
            key: "replace",
            list: substitutionListToJSON(list),
            prefs: {
              replaceUrls: prefs.replaceUrls,
              replaceScripts: prefs.replaceScripts
            }
          });
        }
      });
  }
});