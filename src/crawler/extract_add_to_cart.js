// Possible tags for add-to-cart buttons
let possibleTags = ["button", "input", "a", "add-to-cart-button"];

// Toggles debug print statement
let debugFlag = false;

// Debug print statement
let debug = function(msg) {
    if (debugFlag) {
        console.log(msg);
    }
};

// Gets an element given its string xpath
let getElementByXpath = function(path) {
    return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
};

// Return the min of an array of numbers.
let min = function(a) {
    if (a.length == 0) {
        console.error("Array has no elements");
    }

    let m = a[0];
    for (let i = 0; i < a.length; i++) {
        if (a[i] < m) {
            m = a[i];
        }
    }
    return m;
};

// Return the max of an array of numbers.
let max = function(a) {
    if (a.length == 0) {
        console.error("Array has no elements");
    } else if (a.length == 1) {
        return 0;
    }

    let m = a[0];
    for (let i = 0; i < a.length; i++) {
        if (a[i] > m) {
            m = a[i];
        }
    }
    return m;
};

// Returns an array of the three rgb color values, given a string of the form
// "rgb(#, #, #)" or "rgba(#, #, #, #)".
let extractRgb = function(str) {
    let matchesRgb = str.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    let matchesRgba = str.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)$/);
    let rgb;
    if (matchesRgb != null) {
        rgb = [parseInt(matchesRgb[1]), parseInt(matchesRgb[2]), parseInt(matchesRgb[3])];
    } else if (matchesRgba != null) {
        rgb = [parseInt(matchesRgba[1]), parseInt(matchesRgba[2]), parseInt(matchesRgba[3])];
    } else {
        console.error("Invalid rgb string: " + rgb);
    }
    return rgb;
};

// Returns true if any attribute of elem matches the regex.
let anyAttributeMatches = function(elem, regex) {
    for (let i = 0; i < elem.attributes.length; i++) {
        if (elem.attributes[i].value.match(regex) != null) {
            return true;
        }
    }

    return false;
};

// Returns the absolute difference between this element's color and the page's
// background color.
let computeColorDist = function(elem) {
    let elemRgbStr = getBackgroundColor(elem);
    let body = document.getElementsByTagName("body");
    if (body.length == 0) {
        debug("No body tag, unable to determine background color");
        return 0;
    }
    body = body[0];
    let bodyRgbStr = getBackgroundColor(body);

    let elemRgb = extractRgb(elemRgbStr);
    let bodyRgb = extractRgb(bodyRgbStr);
    let dist = 0;
    for (let i = 0; i < 3; i++) {
        dist += (elemRgb[i] - bodyRgb[i]) * (elemRgb[i] - bodyRgb[i]);
    }
    dist = Math.sqrt(dist);
    return dist;
};

// Returns an indicator (0 or 1) of whether the element (or parent element)
// matches the given regular expression.
let computeRegexScore = function(elem, regex) {
    if (elem.innerText.match(regex) != null) {
        return 1;
    } else if (anyAttributeMatches(elem, regex)) {
        return 1;
    } else if (anyAttributeMatches(elem.parentElement, regex)) {
        return 1;
    } else if (elem.src != undefined && elem.src.match(regex) != null) {
        return 1;
    }
    return 0;
};

// Attempts to find an add-to-cart button on the page. Returns a list of
// possible buttons, sorted with the most likely button first, along with their
// scores (measure of likelihood). Or if no possible buttons are found, returns
// an empty list.
//
// Format of returned array: [{elem: _, score: _}, ...]
let getPossibleAddToCartButtons = function() {
    // Parallel arrays - e.g. feature f of candidates[i] is in fts[f].values[i].
    // Values are between 0 and 1 (higher is better), and weights sum to 1, so
    // resulting weighted scores are between 0 and 1.
    let regex = /(add[ -]?\w*[ -]?to[ -]?(bag|cart|tote|basket|shop|trolley))|(buy[ -]?now)|(shippingATCButton)/i; // variants of "add to cart"
    let candidates = [];
    let fts = {
        // "Distance" between this element's color and the color of the
        // background
        colorDists: {values: [], weight: 0.1},

        // Indicator of whether text/attributes contain a letiant of "add to _"
        regex: {values: [], weight: 0.6},

        // Size of the element
        size: {values: [], weight: 0.3}
    };

    // Select elements that could be buttons, and compute their raw scores
    for (let i = 0; i < possibleTags.length; i++) {
        let matches = Array.from(document.getElementsByTagName(possibleTags[i]));
        for (let j = 0; j < matches.length; j++) {
            let elem = matches[j];

            // Reject if doesn't meet the following conditions
            if (possibleTags[i] == "input" && (elem.type != "button" && elem.type != "submit" && elem.type != "image")) {
                continue;
            }

            if (elem.offsetParent == null) {
                continue;
            }

            candidates.push({elem: elem, score: 0});

            // Compute scores for each feature
            fts.colorDists.values.push(computeColorDist(elem));
            fts.regex.values.push(computeRegexScore(elem, regex));
            fts.size.values.push(elem.offsetWidth * elem.offsetHeight);
        }
    }

    if (candidates.length == 0) {
        return [];
    }

    // Normalize all features so min is 0 and max is 1
    Object.keys(fts).forEach((ft, _) => {
        let m = min(fts[ft].values);
        let M = max(fts[ft].values);
        for (let i = 0; i < fts[ft].values.length; i++) {
            fts[ft].values[i] -= m;
            if (M != 0) {
                fts[ft].values[i] /= M;
            }
        }
    });

    // Compute weighted score for each candidate
    for (let i = 0; i < candidates.length; i++) {
        candidates[i].score = 0;
        Object.keys(fts).forEach((ft, _) => {
            candidates[i].score += fts[ft].weight * fts[ft].values[i];
        });
    }

    // Threshold scores
    let scoreThresh = 0.5;
    let thresholded = [];
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score > scoreThresh) {
            thresholded.push(candidates[i]);
        }
    }
    candidates = thresholded;

    // Only pick elements that are visible
    candidates = candidates.filter(cd => isShown(cd.elem));

    // Sort by score, with highest score first
    candidates.sort(function(x, y) {
        if (x.score > y.score) return -1;
        if (x.score < y.score) return 1;
        return 0;
    });

    return candidates;
};

// Returns the add-to-cart button on the page if one exists, or null if one
// doesn't.
let getAddToCartButton = function() {
    let candidates = getPossibleAddToCartButtons();
    if (candidates.length == 0) {
        return null;
    }
    return candidates[0].elem;
};

let isProductPage = function() {
    let buttons = getPossibleAddToCartButtons();

    if (buttons.length === 0) {
        return false;
    } else if (buttons.length == 1) {
        return true;
    } else {
        if (buttons[0].elem.innerText != buttons[1].elem.innerText) {
            return true;
        } else if (buttons[0].score != buttons[1].score) {
            return true;
        } else {
            return false;
        }
    }
};

// Attempts to find a cart button on the page. Returns a list of possible
// buttons, sorted with the most likely button first, along with their scores
// (measure of likelihood). Or if no possible buttons are found, returns
// an empty list.
//
// Format of returned array: [{elem: _, score: _}, ...]
let getPossibleCartButtons = function() {
    // Returns boolean indicating whether elem is in the navbar/header bar.
    let isInNavbar = function(elem) {
        let regex = /header/i;
        let body = document.getElementsByTagName('body')[0];
        let e = elem.parentElement;
        while (e != body) {
            if (anyAttributeMatches(e, regex)) {
                return true;
            }
            e = e.parentElement;
        }
        return false;
    };

    // Parallel arrays - e.g. feature f of candidates[i] is in fts[f].values[i].
    // Values are between 0 and 1 (higher is better), and weights sum to 1, so
    // resulting weighted scores are between 0 and 1.
    let regex = /(edit|view|shopping|addedto|my|go)[ -]?(\w[ -]?)*(bag|cart|tote|basket|trolley)|(bag|cart|tote|basket|trolley)/i;
    let candidates = [];
    let fts = {
        regex: {values: [], weight: 0.18}, // indicator of whether text/attributes contain the regex
        x: {values: [], weight: 0.17}, // x coordinate
        negY: {values: [], weight: 0.17}, // negative of y coordinate
        negSize: {values: [], weight: 0.16}, // negative of size of the element
        visibility: {values: [], weight: 0.16}, // indicator of whether element is visible or not
        inNavbar: {values: [], weight: 0.16} // indicator of whether element is in navbar
    };

    // Select elements that could be buttons, and compute their raw scores
    for (let i = 0; i < possibleTags.length; i++) {
        let matches = Array.from(document.getElementsByTagName(possibleTags[i]));
        for (let j = 0; j < matches.length; j++) {
            let elem = matches[j];

            if (possibleTags[i] == "input" && (elem.type != "button" && elem.type != "submit" && elem.type != "image")) {
                continue;
            }

            // Add candidate
            let rect = elem.getBoundingClientRect();
            candidates.push({elem: elem, score: 0});
            fts.regex.values.push(computeRegexScore(elem, regex));
            fts.negSize.values.push(-elem.offsetWidth * elem.offsetHeight);
            fts.x.values.push(rect.x);
            fts.negY.values.push(-rect.y);
            fts.visibility.values.push((isShown(elem))? 1 : 0);
            fts.inNavbar.values.push((isInNavbar(elem))? 1 : 0);
        }
    }

    if (candidates.length == 0) {
        return [];
    }

    // Normalize all features so min is 0 and max is 1
    Object.keys(fts).forEach((ft, _) => {
        let m = min(fts[ft].values);
        for (let i = 0; i < fts[ft].values.length; i++) {
            fts[ft].values[i] -= m;
        }
        let M = max(fts[ft].values);
        for (let i = 0; i < fts[ft].values.length; i++) {
            if (M != 0) {
                fts[ft].values[i] /= M;
            }
        }
    });

    // Compute weighted score for each candidate
    for (let i = 0; i < candidates.length; i++) {
        candidates[i].score = 0;
        Object.keys(fts).forEach((ft, _) => {
            candidates[i].score += fts[ft].weight * fts[ft].values[i];
        });
    }

    // Threshold scores
    let scoreThresh = 0.5;
    let thresholded = [];
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score > scoreThresh) {
            thresholded.push(candidates[i]);
        }
    }
    candidates = thresholded;

    // Only pick elements that are visible
    candidates = candidates.filter(cd => isShown(cd.elem));

    // Sort by score, with highest score first
    candidates.sort(function(x, y) {
        if (x.score > y.score) return -1;
        if (x.score < y.score) return 1;
        return 0;
    });

    return candidates;
};

let getCartButton = function() {
    let candidates = getPossibleCartButtons();
    // let addToCartButton = getAddToCartButton();

    // if (addToCartButton) {
    //   candidates = candidates.filter(cd => cd != addToCartButton);
    // }

    // candidates = candidates.filter(cd => isShown(cd));

    if (candidates.length == 0) {
        return null;
    }

    return candidates[0];
};

// Attempts to find a checkout button on the page. Returns a list of possible
// buttons, sorted with the most likely button first, along with their scores
// (measure of likelihood). Or if no possible buttons are found, returns
// an empty list.
//
// Format of returned array: [{elem: _, score: _}, ...]
let getPossibleCheckoutButtons = function() {
    // Parallel arrays - e.g. feature f of candidates[i] is in fts[f].values[i].
    // Values are between 0 and 1 (higher is better), and weights sum to 1, so
    // resulting weighted scores are between 0 and 1.
    let regex = /(proceed|continue)[ -]?(to)?[ -]?(check[ -]?out|pay)|check[ -]?out/i;
    let candidates = [];
    let fts = {
        // "Distance" between this element's color and the color of the
        // background
        colorDists: {values: [], weight: 0.1},

        // Indicator of whether text/attributes contain variants of "checkout"
        regex: {values: [], weight: 0.7},

        // Size of the element
        size: {values: [], weight: 0.2}
    };

    // Select elements that could be buttons, and compute their raw scores
    for (let i = 0; i < possibleTags.length; i++) {
        let matches = Array.from(document.getElementsByTagName(possibleTags[i]));
        for (let j = 0; j < matches.length; j++) {
            let elem = matches[j];

            // Reject if doesn't meet the following conditions
            if (possibleTags[i] == "input" && (elem.type != "button" && elem.type != "submit" && elem.type != "image")) {
                continue;
            }

            if (elem.offsetParent == null) {
                continue;
            }

            candidates.push({elem: elem, score: 0});

            // Compute scores for each feature
            fts.colorDists.values.push(computeColorDist(elem));
            fts.regex.values.push(computeRegexScore(elem, regex));
            fts.size.values.push(elem.offsetWidth * elem.offsetHeight);
        }
    }

    if (candidates.length == 0) {
        return [];
    }

    // Normalize all features so min is 0 and max is 1
    Object.keys(fts).forEach((ft, _) => {
        let m = min(fts[ft].values);
        let M = max(fts[ft].values);
        for (let i = 0; i < fts[ft].values.length; i++) {
            fts[ft].values[i] -= m;
            if (M != 0) {
                fts[ft].values[i] /= M;
            }
        }
    });

    // Compute weighted score for each candidate
    for (let i = 0; i < candidates.length; i++) {
        candidates[i].score = 0;
        Object.keys(fts).forEach((ft, _) => {
            candidates[i].score += fts[ft].weight * fts[ft].values[i];
        });
    }

    // Threshold scores
    let scoreThresh = 0.5;
    let thresholded = [];
    for (let i = 0; i < candidates.length; i++) {
        if (candidates[i].score > scoreThresh) {
            thresholded.push(candidates[i]);
        }
    }
    candidates = thresholded;

    // Only pick elements that are visible
    candidates = candidates.filter(cd => isShown(cd.elem));

    // Sort by score, with highest score first
    candidates.sort(function(x, y) {
        if (x.score > y.score) return -1;
        if (x.score < y.score) return 1;
        return 0;
    });

    return candidates;
};

// Returns the checkout button if one exists, or null if it doesn't.
let getCheckoutButton = function() {
    let candidates = getPossibleCheckoutButtons();
    if (candidates.length == 0) {
        return null;
    }
    return candidates[0].elem;
};
