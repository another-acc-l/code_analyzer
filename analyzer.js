import fs from 'fs';
import path from 'path';

const CONFIG = {
    COMMENT_TYPE: {
        SINGLE: "single",
        INLINE_SINGLE: "inline-single",
        BLOCK_SINGLE: "block-single",
        INLINE_BLOCK: "inline-block",
        BLOCK_MULTILINE: "block-multiline",
    },
    KEYWORDS: {
        logical: ["if", "else", "else if", "try", "catch", "switch", "?"],
        iteration: ["for", "while", "do"],
        jump: ["return", "break", "continue", "throw"],
        dataDeclaration: ["let", "const", "var", "function", "import", "export", "require" ],
        blockDelimiter: ["{"],
    },
};

//finds all comments in the code and returns them as an array of {typem lineStart, lineEnd}
const getComments = (lines) => {
    const { COMMENT_TYPE } = CONFIG;

    const initialState = {
        comments: [],
        inBlockComment: false,
        blockStartLine: -1,
    };

    const currentState = lines.reduce((state, line, index) => {
        const newState = { ...state }; 
        newState.comments = [...state.comments];

        if (newState.inBlockComment) {
            if (line.includes("*/")) {
                newState.comments.push({
                    type: COMMENT_TYPE.BLOCK_MULTILINE,
                    lineStart: newState.blockStartLine,
                    lineEnd: index,
                });
                newState.inBlockComment = false;
                newState.blockStartLine = -1;
            }
            return newState;
        }

        const blockRegex = /\/\*[\s\S]*?\*\//g;
        let lineWithoutBlocks = line;

        const blockMatches = [...line.matchAll(blockRegex)];
        if (blockMatches.length > 0) {
            blockMatches.forEach(match => {
                const before = line.slice(0, match.index).trim();
                const type = (before === "") ? COMMENT_TYPE.BLOCK_SINGLE : COMMENT_TYPE.INLINE_BLOCK;
                newState.comments.push({ type, lineStart: index, lineEnd: index });
            });
            lineWithoutBlocks = line.replace(blockRegex, "");
        }
        
        const lineCommentRegex = /^\s*\/\// 

        if (lineCommentRegex.test(lineWithoutBlocks)) {
            newState.comments.push({ type: COMMENT_TYPE.SINGLE, lineStart: index, lineEnd: index });
        } else if (lineWithoutBlocks.includes("//")) {
            newState.comments.push({ type: COMMENT_TYPE.INLINE_SINGLE, lineStart: index, lineEnd: index });
        }

        if (line.trim().startsWith("/*") && !line.includes("*/")) {
            newState.inBlockComment = true;
            newState.blockStartLine = index;
        }

        return newState;

    }, initialState);

    return currentState.comments;
};

//calculates the number of unique comment lines
const countUniqueCommentLines = (comments) => {
    const allCommentLines = comments.flatMap((comment) =>
        Array.from(
            { length: comment.lineEnd - comment.lineStart + 1 },
            (_, i) => comment.lineStart + i
        )
    );
    return new Set(allCommentLines).size;
};

//counts physical lines of code, takes maximum 25% of blank lines 
const countPhysicalLines = (totalLines, blankLines) => {
    const maxAllowedBlankLines = Math.round(totalLines * 0.25);
    const totalBlankLines = Math.max(0, blankLines - maxAllowedBlankLines);
    return totalLines - totalBlankLines;
};

//counts logical lines of code 
const countLogicalLines = (rawLines, comments) => {
    //rules
    const logicRules = {
        logical: {
            patterns: CONFIG.KEYWORDS.logical,
            counter: countByPatterns
        },
        iteration: {
            patterns: CONFIG.KEYWORDS.iteration,
            counter: countByPatterns,
        },
        jump: {
            patterns: CONFIG.KEYWORDS.jump,
            counter: countByPatterns
        },
        dataDeclaration: {
            patterns: CONFIG.KEYWORDS.dataDeclaration,
            counter: countByPatterns,
        },
        blockDelimiter: {
            patterns: null,
            counter: countBlockDelimiters
        },
        functionCalls: {
            patterns: null,
            counter: countFunctionCalls
        },
    };
    // removes comments (except lines with inline comments) and empty lines
    const lines = removeCommentsAndEmptyLines(rawLines, comments);
    // initializes result object with zero counts for each category
    const result = Object.fromEntries(
        Object.keys(logicRules).map((key) => [key, 0])
    );
    
    lines.forEach((line) => {
        const strippedLine = stripExpressionsArgs(line);// strips function arguments and control keywords

        for (const category in logicRules) {
            const rule = logicRules[category];
            result[category] += rule.counter(strippedLine, rule.patterns);
        }
    });

    result.total = Object.values(result).reduce((sum, count) => sum + count, 0);
    return result;
};

// normalizes a line by stripping arguments from expression
const stripExpressionsArgs = (line) => {
    const controlKeywords = new Set([ "if", "for", "while", "switch", "catch", "require" ]);

    const normalizationRules = [
        {
            pattern: /\b(else\s+if)\s*\([^)]*\)/g,
            replacement: "else if()",
        },
        {
            pattern: /([a-zA-Z_$][\w$]*)\s*\([^)]*\)/g,
            replacement: (match, name) =>
                controlKeywords.has(name) ? `${name}()` : "func()",
        },
    ];

    const normalizedLine = normalizationRules.reduce((currentLine, rule) => {
        return currentLine.replace(rule.pattern, rule.replacement);
    }, line);
    return normalizedLine;
};

// counts occurrences of patterns in a line
const countByPatterns = (line, patterns) => {
    if (!patterns?.length) return 0;

    const { words, symbols } = patterns.reduce(
        (acc, p) => {
            if (/[a-zA-Z0-9]/.test(p)) acc.words.push(p);
            else acc.symbols.push(p);
            return acc;
        },
        { words: [], symbols: [] }
    );

    const wordsPart = words.length ? `\\b(${words.map((p) => p.replace(/\s+/g, "\\s+")).join("|")})\\b` : "";
    const symbolsPart = symbols.length ? symbols.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") : "";
    const regex = new RegExp([wordsPart, symbolsPart].filter(Boolean).join("|"),"g");
    return (line.match(regex) || []).length;
};

// counts function calls in a line, (console.log(), doSomething(arg1,arg2), etc.)
const countFunctionCalls = (line) => (line.match(/func\(\)/g) || []).length;

//counts block delimeters are not a part of control keywords, otherwise it is a control keyword
const countBlockDelimiters = (line) => {
    const controlKeywordsRegex = /\b(if|for|while|switch|try|catch|do)\b/;
    const openBraces = (line.match(/{/g) || []).length;
    return openBraces > 0 && !controlKeywordsRegex.test(line) ? openBraces : 0;
};

// removes comments and empty lines from the code
const removeCommentsAndEmptyLines = (lines, comments) => {
    const cleaned = [...lines];
    const { COMMENT_TYPE } = CONFIG;

    const inlinePatterns = {
        [COMMENT_TYPE.INLINE_SINGLE]: /\/\/.*/,
        [COMMENT_TYPE.INLINE_BLOCK]: /\/\*.*\*\//,
    };

    comments.forEach(({ type, lineStart, lineEnd }) => {
        if (type in inlinePatterns) {
            const pattern = inlinePatterns[type];
            cleaned[lineStart] = cleaned[lineStart].replace(pattern, "").trim();
        } else {
            for (let i = lineStart; i <= lineEnd; i++) {
                cleaned[i] = "";
            }
        }
    });

    return cleaned.filter((line) => line.trim() !== "");
};

// calculates comment coverage percentage
const countCommentCoverage = (physicalLines, commentLines) => physicalLines >0 ? ((commentLines / physicalLines)* 100).toFixed(2) : 0 ;

const analyze = (lines) =>{
    
    const totalLines = lines.length;
    const blankLines = lines.filter((line) => line.trim() === "").length;
    const physicalLines = countPhysicalLines(totalLines,blankLines)

    const comments = getComments(lines);
    const uniqueCommentLines = countUniqueCommentLines(comments);
    const commentCoverage = countCommentCoverage(physicalLines,uniqueCommentLines)

    const logicalLines = countLogicalLines(lines,comments).total;

    return {
        "SLOC": totalLines,
        "Blank LOCs":blankLines,
        "Physical SLOC": physicalLines,
        "Logical SLOC": logicalLines,
        "CLOC, C & SLOC": uniqueCommentLines,
        "Comment Coverage %": commentCoverage,  
     }
}

export const analyzeFile = (filePath) => {
    try {
        const data = fs.readFileSync(filePath, "utf8");
        const lines = data.split(/\r?\n/);
        const result = analyze(lines)
        result.file = filePath;
        return result;
    } catch (error) {
        console.error(`Error in file: ${filePath}`);
        console.error(error.message);
    }
};

export const analyzeDirectory = (directory) => {
    try {
        const items = fs.readdirSync(directory);

        return items.flatMap(item => {
            const currentPath = path.join(directory, item);
            try {
                const stats = fs.statSync(currentPath);

                if (stats.isDirectory()) {
                    if (item !== 'node_modules' && !item.startsWith('.')) {
                        return analyzeDirectory(currentPath);
                    }
                } else if (stats.isFile() && path.extname(currentPath) === '.js' && !currentPath.endsWith('.min.js')) {
                    const result = analyzeFile(currentPath); 
                    return result ? [result] : [];
                }
            } catch (err) {
                console.error(`Unable to access ${currentPath}. Skip.`, err.message);
            }
            
            return [];
        });

    } catch (err) {
        console.error(`Failed to read directory ${directory}.`, err.message);
        return [];
    }
};