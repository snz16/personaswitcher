/* global browser */
/* eslint no-constant-condition: 0 */

const APPEARS_HIGHER_IN_LIST = -1;
const SAME = 0;
const APPEARS_LOWER_IN_LIST = 1;

var browserActionMenu;
var previewAlarmListener;
var rotateAlarmListener;
var currentThemeId;
var loadedThemes;
var currentThemes = [];
var defaultThemes = [];
var defaultTheme = {id: '{972ce4c6-7e08-4474-a285-3208198ce6fd}'};

function handleStartup() 
{
    var checkDefaultsLoaded = browser.storage.local.get("defaults_loaded");
    checkDefaultsLoaded
    .then(loadDefaultsIfNeeded)
    .then(setLogger)
    .then(startRotateAlarm)
    .then(getMenuData)
    .then(buildBrowserActionMenu)
    .then(buildToolsSubmenu)
    .then(buildContextMenu)
    .then(rotateOnStartup)
    .then(function() 
    {
        return browser.storage.onChanged.addListener(handlePreferenceChange);
    })
    .catch(handleError);
}

// Verify if we need to load the default preferences by checking if the 
// default_loaded flag is undefined. 
function loadDefaultsIfNeeded(prefs) 
{
    if ('undefined' === typeof(prefs.defaults_loaded)) 
    {
        return loadDefaults();
    } 
    return Promise.resolve();
}

function loadDefaults()
{   
    let preferences = {};

    preferences.auto = false;
    preferences.random = false;
    preferences.startupSwitch = false;
    preferences.preview = false;
    preferences.iconPreview = true;
    preferences.toolsMenu = false;
    preferences.debug = false;
    preferences.fastSwitch = false;
    preferences.autoMinutes = 30;
    preferences.previewDelay = 0;
    preferences.current = 0;
    preferences.currentThemeId = null;
    preferences.defaults_loaded = true; 

    return browser.storage.local.set(preferences);
}

function getMenuData() 
{
    var menuPreferences = ["iconPreview", "preview", "previewDelay", "current",
                            "currentThemeId"];
    var getData = Promise.all([
        browser.storage.local.get(menuPreferences),
        browser.management.getAll()
    ]);
    return Promise.resolve(getData);
}

function buildBrowserActionMenu(data) 
{
    logger.log("Menu ", browserActionMenu);
    sortThemes(data[1]);
    data[0].current = validateCurrentIndex(data[0].current,
                                           data[0].currentThemeId);
    browserActionMenu = document.createElement("div");
    browserActionMenu.setAttribute("class", "menu");
    // Skip one index value between current and default themes to make it
    // map easier to the index values of the children of browserActionmenu where  
    // the skipped index corresponds to the separator child node between theme 
    // types
    var indexOffset = currentThemes.length+1;
    for (let index = 0; index < currentThemes.length; index++) 
    {        
        browserActionMenu.
            appendChild(buildMenuItem(currentThemes[index], data[0], index));
    }

    insertSeparator();

    for (let index = 0; index < defaultThemes.length; index++) 
    {        
        browserActionMenu.
            appendChild(buildMenuItem(defaultThemes[index], data[0],
                                                    index + indexOffset));
    }

    browserActionMenu.addEventListener('mouseleave',
                    mouseLeaveListener('browserActionMenu', data[0].preview));
    loadedThemes = browserActionMenu.children;
    logger.log("Menu ", browserActionMenu);
    return data[0].current;
}

function buildMenuItem(theme, prefs, theIndex) 
{
    var themeChoice = document.createElement("option");
    themeChoice.setAttribute("class", "button theme");
    themeChoice.setAttribute("id", theme.id);
    var textNode = document.createTextNode(theme.name);
    themeChoice.appendChild(textNode);

    // Cannot access theme icons at present. Uncomment when the management API 
    // is updated.
    /* themeChoice.insertBefore(createIcon(theme.icons[0].url, prefs.iconPreview),
                             textNode);*/

    if (theIndex === prefs.current) 
    {
        themeChoice.selected = true;
        currentThemeId = theme.id;
        if(prefs.currentThemeId !== currentThemeId)
        {
            browser.storage.local.set({"currentThemeId": currentThemeId})
                .catch(handleError);
        }
    }

    if (true === prefs.preview) 
    {
        themeChoice.addEventListener('mouseenter',
                        mouseEnterListener(theme, prefs.previewDelay));
        themeChoice.addEventListener('mouseleave',
                        mouseLeaveListener('button theme', prefs.preview));
    }
    themeChoice.addEventListener('click', clickListener(theme, theIndex));
    return themeChoice;
}

// Function is unused at present. Uncomment for use when the management API is
// developed sufficiently to allow the addition of icons to the menu   
/* function createIcon(iconURL, iconPreview) 
{
    var themeImg = document.createElement("img");
    themeImg.setAttribute("class", "button icon");
    themeImg.setAttribute("src", iconURL);

    if (false === iconPreview) 
    {
        themeImg.style.display = "none";
    }    
    return themeImg;
}*/

function insertSeparator() 
{
    var separator = document.createElement("hr");
    separator.setAttribute("class", "menu-separator");
    browserActionMenu.appendChild(separator);
}

var clickListener = function(theTheme, theIndex) 
{ 
    return function() 
    {
        stopRotateAlarm(); 
        browser.storage.local.get("current").then((result) => 
            {
                logger.log("current: ", result.current);
                switchTheme(theTheme.id, result.current);
                setCurrentTheme(theIndex, result.current, true);
            });
        startRotateAlarm(); 
    };
};

var mouseEnterListener = function(theTheme, previewDelay) 
{
    const MS_TO_MINUTE_CONVERSION = 60000;
    return function() 
    { 
        const delayInMinutes = previewDelay/MS_TO_MINUTE_CONVERSION;
        var innerAlarmListener = function(alarmInfo) 
        {
            startThemePreview(theTheme);
        };
        previewAlarmListener = innerAlarmListener;
        browser.alarms.create("previewAlarm", {delayInMinutes});
        browser.alarms.onAlarm.addListener(previewAlarmListener);
    };
};

var mouseLeaveListener = function(elementClass, preview) 
{ 
    return function() 
    { 
        if(preview)
        {
            browser.alarms.clear("previewAlarm");
            browser.alarms.onAlarm.removeListener(previewAlarmListener);
            if('browserActionMenu' === elementClass)
            {
                endThemePreview();
            } 
        }
    };
};

// Function is unused at present. Uncomment for use when the management API is
// developed sufficiently to allow the addition of icons to the menu   
/* function toggleMenuIcons(iconsShown) 
{
    var displayValue;
    if (true === iconsShown) 
    {
        displayValue = "inline";
    } 
    else 
    {
        displayValue = "none";
    }        
    
    var icons = browserActionMenu.querySelectorAll(".icon");
    for (let index = 0; index < icons.length; index++) 
    {
        logger.log("Icon Node", icons[index]);
        icons[index].style.display = displayValue;
    }
}*/

function buildToolsSubmenu(current) 
{
    browser.storage.local.get("toolsMenu").then((prefs) =>
    {
        if(true === prefs.toolsMenu)
        {
            for(let index = 0; index < currentThemes.length; index++) 
            {
                browser.menus.create({
                  id: String(index),
                  type: 'radio',
                  checked: current === index,
                  title: currentThemes[index].name,
                  contexts: ["tools_menu"]// ,
                  // icons: {
                  // '16': currentThemes[index].icons[0].url}
                });
            }

            browser.menus.create({
                  id: "separator",
                  type: 'separator',
                  contexts: ["tools_menu"]
                });

            for(let index = 0; index < defaultThemes.length; index++) 
            {
                browser.menus.create({
                  id: String(index + currentThemes.length + 1),
                  type: 'radio',
                  checked: (current - (currentThemes.length + 1)) === index,
                  title: defaultThemes[index].name,
                  contexts: ["tools_menu"]// ,
                  // icons: {
                  // '16': defaultThemes[index].icons[0].url}
                });
            }
        }
    });    
}

function removeToolsSubmenu() 
{
    // Because menus.remove is limited to one item at a time and is asynchronous
    // it is currently quicker to simply removal all items and then replace the
    // context menu Options Page and reload Themes items. If more items are 
    // added to the context menu later, this may need to be changed to removing 
    // all the tools menu items individually.
    return browser.menus.removeAll().then(buildContextMenu);
}

function buildContextMenu() 
{ 
    browser.menus.create(
    {
          id: "PSOptions",
          title: "Persona Switcher Options",
          contexts: ["browser_action"]
    });
    browser.menus.create(
    {
          id: "ReloadThemes",
          title: "Refresh PSwitcher Themes",
          contexts: ["browser_action"]
    });
}

function startRotateAlarm() 
{    
    const THREE_SECONDS = (3.0/60.0);
    logger.log("In Rotate Alarm");
    var checkRotatePref = browser.storage.local.
                            get(["auto", "autoMinutes", "fastSwitch"]);
    return checkRotatePref.then((results) => 
    { 
        if (true === results.auto || true === results.fastSwitch) 
        {    
            const periodInMinutes = results.fastSwitch ? THREE_SECONDS :
                                                         results.autoMinutes;
            var innerAlarmListener = function(alarmInfo) 
            {
                if ("rotateAlarm" === alarmInfo.name) 
                {
                    autoRotate();
                } 
            };
            rotateAlarmListener = innerAlarmListener;
            browser.alarms.create("rotateAlarm", {periodInMinutes});
            browser.alarms.onAlarm.addListener(rotateAlarmListener);
        }
        return Promise.resolve();
    });
}

function stopRotateAlarm() 
{
    if ('undefined' !== typeof(rotateAlarmListener)) 
    {
        browser.alarms.clear("rotateAlarm");
        browser.alarms.onAlarm.removeListener(rotateAlarmListener);        
    }
}

function autoRotate() 
{
    var checkRotatePref = browser.storage.local.get(["auto", "fastSwitch"]);    
        
    checkRotatePref.then((results) => 
    {
        if (true === results.auto || true === results.fastSwitch) 
        {
            rotate();
        }
    }, handleError);
}

function rotate() 
{
    if (1 >= currentThemes.length) return;

    var getRotatePref = browser.storage.local.get(["random", "current"]);
    getRotatePref.then((results) => 
    {
        logger.log ("Current index before ", results.current);
        var newIndex = results.current;
        if (true === results.random)
        {
            var prevIndex = newIndex;
            // pick a number between 1 and the end until a new index is found
            while(newIndex === prevIndex) 
            {
                newIndex = Math.floor ((Math.random() *
                        (currentThemes.length-1)) + 1);
            }
        }
        // If a default theme is active, rotate to the first non-default 
        // theme
        else if(newIndex > currentThemes.length-1) 
        {
            newIndex = 0;
        } 
        else 
        {
            newIndex = (newIndex + 1) % currentThemes.length;
        }

        logger.log ("Current index after ", newIndex);
        switchTheme(currentThemes[newIndex].id);
        setCurrentTheme(newIndex, results.current, true);
    });    
}

function rotateOnStartup() 
{
    logger.log("Rotate on Startup");
    var checkRotateOnStartup = browser.storage.local.get("startupSwitch");
    checkRotateOnStartup.then((prefs) => 
    {
        if(true === prefs.startupSwitch) 
        {
            rotate();
        }
    });
}

function switchTheme(newId)
{
    browser.management.setEnabled(newId, true);
}

function startThemePreview(theme) 
{
    switchTheme(theme.id);
}

function endThemePreview() 
{    
    switchTheme(currentThemeId);
}

function setCurrentTheme(newIndex, oldIndex, updateToolsMenu)
{  

    if(newIndex !== oldIndex)
    {
        updateCurrentThemeId(newIndex);
        updateCurrentIndex(newIndex);        
        updateBrowserActionSelection(newIndex, oldIndex);

        if(true === updateToolsMenu)
        {            
            updateToolsMenuSelection(newIndex, oldIndex);            
        }
    }
}

function updateCurrentThemeId(newIndex) 
{
    if(newIndex < currentThemes.length) 
    {
        currentThemeId = currentThemes[newIndex].id;
    }
    else
    {
        logger.log(newIndex, newIndex - (currentThemes.length+1));
        currentThemeId = defaultThemes[newIndex - (currentThemes.length+1)].id;
    }
    browser.storage.local.set({'currentThemeId': currentThemeId})
        .catch(handleError);
}

function updateCurrentIndex(newIndex)
{
    var updatingCurrentIndex = browser.storage.local.set({current: newIndex});
            updatingCurrentIndex.catch(handleError); 
}

function updateBrowserActionSelection(newIndex, oldIndex)
{
    if('undefined' !== typeof(oldIndex) && oldIndex < loadedThemes.length) 
        {
            loadedThemes[oldIndex].selected = false;
        }
        loadedThemes[newIndex].selected = true;  
}

function updateToolsMenuSelection(newIndex, oldIndex)
{
    browser.storage.local.get("toolsMenu").then((prefs) =>
        {
            if(true === prefs.toolsMenu) 
            {
                logger.log("Tools Menu Selection: ", String(newIndex));
                // ...??? The manual update of checked: true correctly updating
                // the newly checked item and unchecking the old only works
                // when the new item appears after the old checked item in the
                // context menu. Currently the best work around is simply to
                // always uncheck the old item before checking the new.                
                let updateToolMenu = browser.menus
                          .update(String(oldIndex), {checked: false});
                updateToolMenu.catch(handleError);

                updateToolMenu = browser.menus
                           .update(String(newIndex), {checked: true});
                updateToolMenu.catch(handleError);
            }
        }); 
}

function activateDefault()
{
    logger.log("in activateDefault");
    let index = getDefaultThemeIndex();    
    switchTheme(defaultTheme.id);
    var getOldThemeIndex = browser.storage.local.get("current");
    getOldThemeIndex.then((pref) =>
        {
            setCurrentTheme(index, pref.current, true);
        }
    );
}

function getDefaultThemeIndex()
{
    let index;
    for(index = 0; index < defaultThemes.length; index++)
    {
        if(defaultTheme.id === defaultThemes[index].id)
        {
            index = index + currentThemes.length + 1;
            break;
        }
    }
    return index;
}

function handlePreferenceChange(changes, area) 
{ 
      var changedPrefs = Object.keys(changes);
 
      for (var pref of changedPrefs) 
      {
        if ('undefined' !== typeof(changes[pref].newValue) && 
            changes[pref].oldValue !== changes[pref].newValue &&
            'local' === area) 
        {
            reactToPrefChange(pref, changes[pref]);
        }
    }
}

function reactToPrefChange(prefName, prefData) 
{
    switch (prefName) 
    {
        case 'iconPreview':
            // Function is unused at present. Uncomment for use when the
            // management API is developed sufficiently to allow the addition   
            // of icons to the menu 
            // toggleMenuIcons(prefData.newValue);
            break;
        case 'preview':
        case 'previewDelay':
            getMenuData().then(buildBrowserActionMenu, handleError);
            break;
        case 'debug':
            setLogger();
            break;
        case 'autoMinutes':
            var getAutoSwitch = browser.storage.local.get("auto");
            getAutoSwitch.then((pref) =>
            {
                if(true === pref.auto)
                {
                    stopRotateAlarm();
                    startRotateAlarm();                        
                }
            });
            break;
        case 'fastSwitch':
            // falls through to auto
        case 'auto':
            if(true === prefData.newValue) 
            {
                startRotateAlarm();                
            }
            else 
            {
                stopRotateAlarm();                
            }
            break;
        case 'toolsMenu':
            if(true === prefData.newValue) 
            {
                var getCurrentIndex = browser.storage.local.get("current");
                getCurrentIndex.then((result) =>
                {
                    buildToolsSubmenu(result.current);                    
                });
            } 
            else
            {
                removeToolsSubmenu();
            }
            break;
        default:
            // ignore the others
    }
}

function sortThemes(addonInfos) 
{
    currentThemes = [];
    for(let info of addonInfos) 
    {
        if("theme" === info.type) 
        {
            logger.log(info.name, info);
            currentThemes.push(info);            
        }
    }

    logger.log ("Themes found", " " + currentThemes.length);

    currentThemes.
        sort(function (a, b) 
        { 
            return a.name.localeCompare(b.name); 
        });
    extractDefaults();
    logger.log ("User installed themes", " " + currentThemes.length);
}

// Assumes currentThemes and defaultThemes are accurate
// (IE sortThemes has been called previously)
function validateCurrentIndex(current, currentThemeId) 
{
    // On first run, the currentThemeId will be null. 
    if('undefined' === typeof(currentThemeId) || null === currentThemeId)
    {
        return findActiveTheme();
    }

    let themesToCheck;
    let themeIndex;
    if(currentThemes.length < current)
    {
        themesToCheck = defaultThemes;
        themeIndex = current - (currentThemes.length + 1);
    }
    else
    {
        themesToCheck = currentThemes;
        themeIndex = current;
    }

    if(true === themesToCheck[themeIndex].enabled)
    {
        return current;
    }
    
    return findActiveTheme();
        
}

function findActiveTheme()
{
    for(let index = 0; index < currentThemes.length; index++)
    {
        if(true === currentThemes[index].enabled)
        {            
            updateCurrentIndex(index);
            return index;
        }
    }

    for(let index = 0; index < defaultThemes.length; index++)
    {
        if(true === defaultThemes[index].enabled)
        {
            index = index + currentThemes.length + 1;
            updateCurrentIndex(index);
            return index;
        }
    }
    return false;
}

function extractDefaults() 
{
    defaultThemes = [];
    var defaultNotFound = true;
    var theme;
    // We do not want to iterate over the array backwards as that would
    // necessitate evaluation of a majority of the array and we want to make
    // this as quick as possible. As such, we account for the removal of items
    // while iterating over the array by decrementing the index to compensate.
    for(let index = 0; index < currentThemes.length; index++) 
    {
        theme = currentThemes[index];
        if(APPEARS_HIGHER_IN_LIST === theme.name.localeCompare("Compact Dark")) 
        {
            continue;
        }
        else if(isDefaultTheme(theme.name)) 
        {
            logger.log(theme.name, " " + theme.id);
            defaultThemes.push(theme);
            currentThemes.splice(index, 1);
            index -= 1; // ESLint set to no unary operators?
            if(defaultNotFound) 
            {
                defaultNotFound = SAME !== theme.name.localeCompare("Default");
            }
        }
        else if(APPEARS_LOWER_IN_LIST === theme.name.localeCompare("Light")) 
        {
            break;
        }
    }

    if(defaultNotFound) 
    {
        defaultThemes.push(defaultTheme);
    }
}

function isDefaultTheme(themeName)
{
    return  "Compact Dark"  === themeName || 
            "Compact Light" === themeName || 
            "Dark"          === themeName || 
            "Light"         === themeName ||
            "Default"       === themeName;
}

function toolsMenuThemeSelect(index)
{
    logger.log("Context menu id:", index);
    let themeId;
    if(index < currentThemes.length)
    {
        themeId = currentThemes[index].id;
    }
    else
    {
        themeId = defaultThemes[index-(currentThemes.length+1)].id;
    }
    switchTheme(themeId);

    browser.storage.local.get("current").then((pref) =>
        {
            // Because Mozilla automatically separates the the items above
            // and below a separator into distinct groups, when switching
            // from a default theme to a user installed, or vice versa, the
            // old group's radio button must be disabled manually 
            if((pref.current < currentThemes.length  &&
                index > currentThemes.length) ||
               (pref.current > currentThemes.length  &&
                index < currentThemes.length))
            {
                let updateToolMenu = browser.menus
                      .update(String(pref.current), {checked: false});
                updateToolMenu.catch(handleError);
            }
            
            setCurrentTheme(index, pref.current, false);
        });
}

function reloadThemes() 
{
    removeToolsSubmenu().then(getMenuData)
                        .then(buildBrowserActionMenu)
                        .then(buildToolsSubmenu)
                        .catch(handleError);
}

browser.menus.onClicked.addListener((info) => 
{

    logger.log("Context menu id:", info.menuItemId);
    switch(info.menuItemId)
    {
        case "PSOptions":
            browser.runtime.openOptionsPage(); 
            break;
        case "ReloadThemes":
            reloadThemes();
            break;
        default:
            toolsMenuThemeSelect(parseInt(info.menuItemId));
    }
});

browser.commands.onCommand.addListener(function(command) 
{
    switch (command) 
    {
        case "switch_to_default":
            activateDefault();
            break;
        case "rotate":
            rotate();
            break;
        case "toggle_autoswitch":
            var getAutoPref = browser.storage.local.get("auto");
            getAutoPref.then((pref) => 
                {
                    browser.storage.local.set({'auto': !pref.auto})
                        .catch(handleError);
                    logger.log("Auto: ", !pref.auto);
                }
            );
            break;
        default:
            // should never get here
            logger.log(command, " not recognized");
            break;
    }
});

var logger = console;
var nullLogger = {};
nullLogger.log = function () 
{ 
    return; 
};

function setLogger() 
{
    var checkIfDebugging = browser.storage.local.get("debug");
    return checkIfDebugging.then((result) => 
    {
        if (true === result.debug) 
        {
            logger = console;
        } 
        else 
        {
            logger = nullLogger;
        }        
        return Promise.resolve();
    });
}

function handleError(error) 
{
    logger.log(`${error}`);
}

handleStartup();