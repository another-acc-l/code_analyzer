# Code analyzer metrics tool

It's an utility to analyze code metrics

# How to use

To analyze file, run the following command

```bash
  node index.js /path/to/file.js
```
Optionally, download any js library

As example, lodash
```bash
cd tests

git clone https://github.com/lodash/lodash.git
```
Run the following command

```bash
node index.js tests/lodash
```