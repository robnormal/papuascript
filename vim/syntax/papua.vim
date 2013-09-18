" Language:    papuaScript
" Maintainer:  Mick Koch <kchmck@gmail.com>
" URL:         http://github.com/kchmck/vim-papua-script
" License:     WTFPL

" Bail if our syntax is already loaded.
if exists('b:current_syntax') && b:current_syntax == 'papua'
  finish
endif

" Highlight long strings.
syn sync minlines=100

" papuaScript identifiers can have dollar signs.
setlocal isident+=$

" These are `matches` instead of `keywords` because vim's highlighting
" priority for keywords is higher than matches. This causes keywords to be
" highlighted inside matches, even if a match says it shouldn't contain them --
" like with papuaAssign and papuaDot.
syn match papuaStatement /\<\%(break\|continue\|throw\)\>/ display
hi def link papuaStatement Statement

syn match papuaRepeat /\<\%(for\|while\)\>/ display
hi def link papuaRepeat Repeat

syn match papuaConditional /\<\%(if\|else\|switch\|case\)\>/
\                           display
hi def link papuaConditional Conditional

syn match papuaException /\<\%(try\|catch\|finally\)\>/ display
hi def link papuaException Exception

" The `own` keyword is only a keyword after `for`.
syn match coffeeKeyword /\<for\s\+own\>/ contained containedin=coffeeRepeat
\                       display
hi def link coffeeKeyword Keyword

syn match papuaKeyword /\<\%(new\|let\|in\|do\|var\)\>/
\                       display
" The `own` keyword is only a keyword after `for`.
syn match papuaKeyword /\<for\s\+own\>/ contained containedin=papuaRepeat
\                       display
syn match papuaKeyword /\<for\s\+index\>/ contained containedin=papuaRepeat
\                       display
syn match papuaKeyword /\<for\s\+keys\>/ contained containedin=papuaRepeat
\                       display
hi def link papuaKeyword Keyword

syn match papuaOperator /\<\%(instanceof\|typeof\|delete\)\>/ display
hi def link papuaOperator Operator

" The first case matches symbol operators only if they have an operand before.
syn match papuaExtendedOp /\%(\S\s*\)\@<=[+\-*/%#&|\^=!<>?]\{-1,}\|[-=]>\|&&\|||\|--\|++\|:\|\\/
\                          display
hi def link papuaExtendedOp papuaOperator

" This is separate from `papuaExtendedOp` to help differentiate commas from
" dots.
syn match papuaSpecialOp /[,;]/ display
hi def link papuaSpecialOp SpecialChar

syn match papuaBoolean /\<\%(true\|false\)\>/ display
hi def link papuaBoolean Boolean

syn match papuaGlobal /\<\%(null\|undefined\)\>/ display
hi def link papuaGlobal Type

" A special variable
syn match papuaSpecialVar /\<\%(this\|prototype\|arguments\)\>/ display
hi def link papuaSpecialVar Special

" An @-variable
syn match papuaSpecialIdent /@\%(\I\i*\)\?/ display
hi def link papuaSpecialIdent Identifier

" A class-like name that starts with a capital letter
syn match papuaObject /\<\u\w*\>/ display
hi def link papuaObject Structure

" A constant-like name in SCREAMING_CAPS
syn match papuaConstant /\<\u[A-Z0-9_]\+\>/ display
hi def link papuaConstant Constant

" A variable name
syn cluster papuaIdentifier contains=papuaSpecialVar,papuaSpecialIdent,
\                                     papuaObject,papuaConstant

" A non-interpolated string
syn cluster papuaBasicString contains=@Spell,papuaEscape

" Regular strings
syn region papuaString start=/"/ skip=/\\\\\|\\"/ end=/"/
\                       contains=@papuaBasicString
syn region papuaString start=/'/ skip=/\\\\\|\\'/ end=/'/
\                       contains=@papuaBasicString
hi def link papuaString String

" A integer, including a leading plus or minus
syn match papuaNumber /\i\@<![-+]\?\d\+\%([eE][+-]\?\d\+\)\?/ display
" A hex, binary, or octal number
syn match papuaNumber /\<0[xX]\x\+\>/ display
syn match papuaNumber /\<0[bB][01]\+\>/ display
syn match papuaNumber /\<0[oO][0-7]\+\>/ display
hi def link papuaNumber Number

" Ignore reserved words in dot accesses.
" syn match papuaDotAccess /\.\@<!\.\s*\I\i*/he=s+1 contains=@papuaIdentifier
" syn match papuaDotAccess /\.\@<!\.\s*\I\i*/he=s+1 contains=@papuaIdentifier

syn match papuaNumericAccess /\([^A-Za-z_]\d\+\|\s|^\)\@<!\.\d\+/ display
hi def link papuaNumericAccess Identifier

" hi def link papuaDotAccess papuaExtendedOp
" A floating-point number, including a leading plus or minus
syn match papuaFloat /\i\@<![-+]\?\d*\.\@<!\.\d\+\%([eE][+-]\?\d\+\)\?/
\                     display
hi def link papuaFloat Float

" A normal object assignment
syn match papuaObjAssign /@\?\I\i*\s*\ze::\@!/ contains=@papuaIdentifier display
hi def link papuaObjAssign Identifier

syn keyword papuaTodo TODO FIXME XXX contained
hi def link papuaTodo Todo

syn match papuaComment /\/\/.*/ contains=@Spell,papuaTodo
hi def link papuaComment Comment

syn region papuaBlockComment start=/\/\*/ end=/\*\// contains=papuaBlockComment
\                             contains=@Spell,papuaTodo
hi def link papuaBlockComment papuaComment

" Operator-fied function
syn region papuaOpFunc 
\                      start=/`/ skip=/\\\\\|\\`/ end=/`/
\                      contains=@papuaOperator
hi def link papuaOpFunc papuaOperator

" do-notation
syn match papuaDoLikeNotation /<-\w*/ contains=@papuaExtendedOp display
hi def link papuaDoLikeNotation papuaExtendedOp

" A string escape sequence
syn match papuaEscape /\\\d\d\d\|\\x\x\{2\}\|\\u\x\{4\}\|\\./ contained display
hi def link papuaEscape SpecialChar

" An error for trailing whitespace, as long as the line isn't just whitespace
if !exists("papua_no_trailing_space_error")
  syn match papuaSpaceError /\S\@<=\s\+$/ display
  hi def link papuaSpaceError Error
endif

" An error for trailing semicolons, for help transitioning from JavaScript
if !exists("papua_no_trailing_semicolon_error")
  syn match papuaSemicolonError /;$/ display
  hi def link papuaSemicolonError Error
endif

syn match papuaMethodChain /\s\.\s*\w\+/ display
hi def link papuaMethodChain papuaOperator

syn match papuaFuncArg /\\\s*\(\w\+\s\+\)*->/ contains=papuaExtendedOp display
hi def link papuaFuncArg Special

syn match papuaImportKeywords /import\|as/ contains=papuaExtendedOp contained display
hi def link papuaImportKeywords Special
syn match papuaImport /\vimport\s+\(.*\)(\s+as\s+\w+)?/ contains=papuaImportKeywords,papuaParens display

" This is required for interpolations to work.
syn region papuaCurlies matchgroup=papuaCurly start=/{/ end=/}/
\                        contains=@papuaAll
syn region papuaBrackets matchgroup=papuaBracket start=/\[/ end=/\]/
\                         contains=@papuaAll
syn region papuaParens matchgroup=papuaParen start=/(/ end=/)/
\                       contains=@papuaAll

syn region  papuaRegex   start=+/[^/*]+me=e-1 skip=+\\\\\|\\/+ end=+/[gi]\{0,2\}\s*$+ end=+/[gi]\{0,2\}\s*[;.,)\]}]+me=e-1 oneline
hi def link papuaRegex String

" These are highlighted the same as commas since they tend to go together.
hi def link papuaBlock papuaSpecialOp
hi def link papuaBracket papuaBlock
hi def link papuaCurly papuaBlock
hi def link papuaParen papuaBlock

" This is used instead of TOP to keep things papua-specific for good
" embedding. `contained` groups aren't included.
syn cluster papuaAll contains=papuaStatement,papuaRepeat,papuaConditional,
\                              papuaException,papuaKeyword,papuaOperator,
\                              papuaExtendedOp,papuaSpecialOp,papuaBoolean,
\                              papuaGlobal,papuaSpecialVar,papuaSpecialIdent,
\                              papuaObject,papuaConstant,papuaString,
\                              papuaNumber,papuaFloat,papuaReservedError,
\                              papuaObjAssign,papuaComment,papuaBlockComment,
\                              papuaOpFunc,papuaRegex,papuaHeregex,
\                              papuaHeredoc,papuaSpaceError,
\                              papuaSemicolonError,papuaDotAccess,papuaMethodChain,
\                              papuaProtoAccess,papuaCurlies,papuaBrackets,
\                              papuaParens,papuaFuncArg,papuaImport,papuaImportKeywords,papuaDoLikeNotation 

if !exists('b:current_syntax')
  let b:current_syntax = 'papua'
endif

