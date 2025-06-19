import fs from "fs"
import path from "path"
import { analyzeDirectory, analyzeFile } from "./analyzer.js"


const displayDirectorySummary = (results) =>{

    const directorySummary = results.reduce((acc, result) => {
        acc["SLOC"] += result["SLOC"];
        acc["Blank LOCs"] += result["Blank LOCs"];
        acc["Physical SLOC"] += result["Physical SLOC"];
        acc["Logical SLOC"] += result["Logical SLOC"];
        acc["CLOC, C & SLOC"] += result["CLOC, C & SLOC"];
        return acc;
    }, {
        "SLOC": 0,
        "Blank LOCs": 0,
        "Physical SLOC": 0,
        "Logical SLOC": 0,
        "CLOC, C & SLOC": 0,
    })
    directorySummary["KLOC"] = directorySummary["SLOC"] / 1000;
    directorySummary["Average Comment Coverage"] = directorySummary["Physical SLOC"] > 0 ? (directorySummary["CLOC, C & SLOC"] / directorySummary["Physical SLOC"]) * 100 : 0;
    console.log("Directory Summary:")
    console.table(directorySummary)
    console.log("Detailed Results:")
    console.table(results)
}

const main = () =>{
    const target = process.argv[2]

    if (!target){
        console.error(`Path must be provided`)
        console.log( `node index.js ./tests/test.js`)
        console.log( `node index.js ./tests/lib`)
        return;
    }

    if(!fs.existsSync(target)){
        console.error("Incorrect path")
        return;
    }

    try {
        const stats = fs.statSync(target)
        if(path.extname(target).toLowerCase().trim() === '.js'){
            if(stats.isFile()){
                const result = analyzeFile(target)
                console.table(result)
            }
        }
        else{
            if(stats.isDirectory()){
                const results = analyzeDirectory(target)
                
                displayDirectorySummary(results)
            }
        }
    } catch (error) {
        console.error(`Error processing path: ${target}`);
        console.error(error.message);
    }

}

main()