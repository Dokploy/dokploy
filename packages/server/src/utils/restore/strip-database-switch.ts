import { quote } from "shell-quote";

// Runs on the Docker host, which need not have Node installed. Track SQL client
// delimiters and lexical context: matching lines can also be stored-object data.
const filter = String.raw`
function beginStatement(pos) {
  if (!started) {
    printf "%s", substr(line, chunk, pos - chunk)
    chunk = pos
    started = 1
  }
}
function endWord() {
  if (word == "") return
  if (prefix == "") first = toupper(word)
  if (!decision) {
    prefix = prefix (prefix == "" ? "" : " ") toupper(word)
    if (prefix == "USE" || prefix ~ /^CREATE( OR REPLACE)? (DATABASE|SCHEMA)$/) decision = 2
    else if (prefix != "CREATE" && prefix != "CREATE OR" && prefix != "CREATE OR REPLACE") decision = 1
  }
  word = ""
}
function output(text) {
  if (first == "SET") modeStatement = modeStatement text
  if (!started || decision == 1) {
    printf "%s%s", pending, text
    pending = ""
  } else if (!decision) pending = pending text
  else pending = ""
}
function updateMode(    sql, assignment, variable, value, marker) {
  sql = toupper(modeStatement)
  if (match(sql, /@[A-Z0-9_]+[[:space:]]*=[[:space:]]*@@(SESSION[.])?SQL_MODE/)) {
    variable = substr(sql, RSTART, RLENGTH)
    sub(/[[:space:]]*=.*/, "", variable)
    savedModes[variable] = noBackslash
    savedAnsiQuotes[variable] = ansiQuotes
  }
  if (match(sql, /(^|[[:space:],])(@@SESSION[.]|@@)?SQL_MODE[[:space:]]*=[[:space:]]*/)) {
    assignment = substr(sql, RSTART + RLENGTH)
    marker = substr(assignment, 1, 1)
    if (marker == single || marker == "\"") {
      value = substr(assignment, 2)
      value = substr(value, 1, index(value, marker) - 1)
      noBackslash = index(value, "NO_BACKSLASH_ESCAPES") > 0
      ansiQuotes = index(value, "ANSI_QUOTES") > 0
    } else if (match(assignment, /^@[A-Z0-9_]+/)) {
      variable = substr(assignment, RSTART, RLENGTH)
      if (variable in savedModes) {
        noBackslash = savedModes[variable]
        ansiQuotes = savedAnsiQuotes[variable]
      }
    }
  }
}
function finishStatement() {
  if (first == "SET") updateMode()
  started = decision = 0
  prefix = first = pending = modeStatement = ""
}
BEGIN {
  delimiter = ";"
  single = sprintf("%c", 39)
  backtick = sprintf("%c", 96)
}
{
  line = $0 "\n"
  chunk = 1
  if (!started && !quoted && !block && tolower(line) ~ /^[[:space:]]*delimiter[[:space:]]+/) {
    delimiter = line
    sub(/^[[:space:]]*[^[:space:]]+[[:space:]]+/, "", delimiter)
    sub(/[[:space:]]+$/, "", delimiter)
    if (delimiter == "" || delimiter ~ /[[:space:]]/) {
      print "Invalid SQL delimiter" > "/dev/stderr"
      failed = 1
      exit 2
    }
    printf "%s", line
    next
  }
  for (i = 1; i <= length(line); i++) {
    c = substr(line, i, 1)
    pair = substr(line, i, 2)
    if (lineComment) {
      if (c == "\n") lineComment = 0
      continue
    }
    if (quoted) {
      if (c == "\\" && quoted != backtick && !(quoted == "\"" && ansiQuotes) && !noBackslash) i++
      else if (c == quoted) {
        if (substr(line, i + 1, 1) == quoted) i++
        else quoted = ""
      }
      continue
    }
    if (block && pair == "*/") {
      endWord()
      block = 0
      i++
      continue
    }
    if (block == 1) continue
    if (!block && substr(line, i, length(delimiter)) == delimiter) {
      endWord()
      output(substr(line, chunk, i - chunk + length(delimiter)))
      i += length(delimiter) - 1
      chunk = i + 1
      finishStatement()
      continue
    }
    if (!block && pair == "/*") {
      endWord()
      marker = substr(line, i + 2, 1)
      block = marker == "!" || substr(line, i + 2, 2) == "M!" ? 2 : 1
      if (block == 2) {
        beginStatement(i)
        i += marker == "!" ? 2 : 3
        while (substr(line, i + 1, 1) ~ /[0-9]/) i++
      } else i++
      continue
    }
    if (c == "#" || (pair == "--" && substr(line, i + 2, 1) ~ /[[:space:]]/)) {
      endWord()
      lineComment = 1
      continue
    }
    if (c ~ /[[:space:]]/) {
      endWord()
      continue
    }
    beginStatement(i)
    if (c == single || c == "\"" || c == backtick) {
      endWord()
      quoted = c
      if (!decision) decision = 1
    } else if (c ~ /[[:alnum:]_$]/) {
      if (!decision) word = word c
    } else {
      endWord()
      if (!decision) decision = 1
    }
  }
  output(substr(line, chunk))
}
END {
  if (failed) exit 2
  if (quoted || block) {
    print "Unterminated SQL quote or comment" > "/dev/stderr"
    exit 2
  }
  endWord()
  if (!decision) decision = 1
  output("")
}
`;

export const stripDatabaseSwitchCommand = `LC_ALL=C awk ${quote([filter])}`;
