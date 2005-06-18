const displayName         = "BiDi Mail UI";
const name                = "bidimailpack";
const jarName             = name + ".jar";
const jarPath             = "chrome/";
const jarLocation         = jarPath + jarName;
const existsInApplication = File.exists(getFolder(getFolder("chrome"), jarName));
const version             = "0.6.6";
const optionalThe         = "the "; // if package name is an inspecific noun, use "the ", otherwise ""

var contentFlag = CONTENT | PROFILE_CHROME;
var localeFlag  = LOCALE  | PROFILE_CHROME;
var skinFlag    = SKIN    | PROFILE_CHROME;
var retval      = null;
var folder      = getFolder("Current User", "chrome");

const existsInProfile = File.exists(getFolder(folder, jarName));

// If the extension exists in the application folder or it doesn't exist in the profile folder and the user doesn't want it installed to the profile folder
if(existsInApplication || (!existsInProfile && !confirm("Do you want to install " + optionalThe + displayName + " extension into your profile folder?\n(Cancel will install into the application folder)")))
{
    if (existsInApplication)
    {
        alert("This extension is already installed in the application folder, overwriting it there.");
    }
    contentFlag = CONTENT | DELAYED_CHROME;
    localeFlag  = LOCALE  | DELAYED_CHROME;
    skinFlag    = SKIN    | DELAYED_CHROME;
    folder      = getFolder("chrome");
}

initInstall(displayName, name, version);
setPackageFolder(folder);
retval = addFile(name, version, jarLocation, folder, null);

// If adding the JAR file succeeded
if(retval == SUCCESS)
{
    folder = getFolder(folder, jarName);

    registerChrome(contentFlag, folder, "content/" + name + "/");
    registerChrome(localeFlag, folder, "locale/en-US/" + name + "/");
    registerChrome(localeFlag, folder, "locale/he-IL/" + name + "/");
    registerChrome(localeFlag, folder, "locale/ar-SA/" + name + "/");
    registerChrome(skinFlag, folder, "skin/classic/" + name + "/");
    registerChrome(skinFlag, folder, "skin/modern/" + name + "/");
    
    retval = performInstall();

    if ((retval != SUCCESS) && (retval != 999) && (retval != -239))
    {
        explainInstallRetval(retval,false);
        cancelInstall(retval);
    }
    //else
    //{
    //    explainInstallRetval(retval,true);
    //}
}
else
{
    explainInstallRetval(retval,false);
    cancelInstall(retval);
}

function explainInstallRetval(retval,considered_success)
{
    var str = "The installation of the " + displayName + " extension ";
    if (retval == SUCCESS)
    {
        str += "succeeded.";
    }
    else 
    {
        if (considered_success)
        {
            str += "succeeded. Please note:\n";
        }
        else 
        {
            str += "failed:\n";
        }

        if(retval == -215)
        {
            str += "One of the files being overwritten is read-only.";
        }
        else if(retval == -235)
        {
            str += "There is insufficient disk space.";
        }
        else if(retval == -239)
        {
            str += "There has been a chrome registration error.";
        }
        else if(retval == 999)
        {
            str += "You must restart the browser for the installation to take effect.";
        }
        else
        {
            str += "Installation returned with code: " + retval;
        }
    }
    alert(str);
}
