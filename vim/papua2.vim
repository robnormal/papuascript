" Bail if our syntax is already loaded.
if exists('b:current_syntax') && b:current_syntax == 'papua'
  finish
endif

" Highlight long strings.
syn sync minlines=100

" like javascript, identifiers can have $
setlocal isident+=$

syn match papuaStatement /\<\%(break\|continue\|throw\|cont\)\>/ display
hi def link papuaStatement Statement

syn match papuaRepeat /\<\%(for\|while\)\>/ display
hi def link papuaRepeat Repeat

syn match papuaConditional /\<\%(if\|else\|switch\)\>/
\                           display
hi def link papuaConditional Conditional

syn match papuaException /\<\%(try\|catch\|finally\)\>/ display
hi def link papuaException Exception

syn match papuaKeyword /\<for\s\+own\>/ contained containedin=papuaRepeat
syn match papuaKeyword /\<for\s\+index\>/ contained containedin=papuaRepeat
syn match papuaKeyword /\<for\s\+keys\>/ contained containedin=papuaRepeat

syn match papuaOperator /\<\%(instanceof\|typeof\|delete\)\>/ display
hi def link papuaOperator Operator

" The first case matches symbol operators only if they have an operand before.
syn match papuaExtendedOp /\%(\S\s*\)\@<=[+\-*/%&|\^=!<>?.]\{-1,}\|[-=]>\|--\|++\|:\|\\/
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

" A integer, including a leading plus or minus
syn match papuaNumber /\i\@<![-+]\?\d\+\%([eE][+-]\?\d\+\)\?/ display
" A hex, binary, or octal number
syn match papuaNumber /\<0[xX]\x\+\>/ display
syn match papuaNumber /\<0[bB][01]\+\>/ display
syn match papuaNumber /\<0[oO][0-7]\+\>/ display
hi def link papuaNumber Number

" A floating-point number, including a leading plus or minus
syn match papuaFloat /\i\@<![-+]\?\d*\.\@<!\.\d\+\%([eE][+-]\?\d\+\)\?/
\                     display
hi def link papuaFloat Float

syn keyword papuaTodo TODO FIXME XXX contained
hi def link papuaTodo Todo

syn match papuaComment /\/\/.*/ contains=@Spell,papuaTodo
hi def link papuaComment Comment

syn region papuaBlockComment start=/\/\*#\@!/ end=/\*\//
\                             contains=@Spell,papuaTodo
hi def link papuaBlockComment papuaComment


" An error for trailing semicolons, for help transitioning from JavaScript
if !exists("papua_no_trailing_semicolon_error")
  syn match papuaSemicolonError /;$/ display
  hi def link papuaSemicolonError Error
endif

" Ignore reserved words in dot accesses.
syn match papuaDotAccess /\.\@<!\.\s*\I\i*/he=s+1 contains=@papuaIdentifier
hi def link papuaDotAccess papuaExtendedOp

" Ignore reserved words in prototype accesses.
syn match papuaProtoAccess /::\s*\I\i*/he=s+2 contains=@papuaIdentifier
hi def link papuaProtoAccess papuaExtendedOp


" These are highlighted the same as commas since they tend to go together.
hi def link papuaBlock papuaSpecialOp
hi def link papuaBracket papuaBlock
hi def link papuaCurly papuaBlock
hi def link papuaParen papuaBlock


" A non-interpolated string
syn cluster papuaBasicString contains=@Spell,papuaEscape
" An interpolated string
syn cluster papuaInterpString contains=@papuaBasicString,papuaInterp

" Regular strings
syn region papuaString start=/"/ skip=/\\\\\|\\"/ end=/"/
\                       contains=@papuaInterpString
syn region papuaString start=/'/ skip=/\\\\\|\\'/ end=/'/
\                       contains=@papuaBasicString
hi def link papuaString String

" Embedded JavaScript
syn region papuaEmbed matchgroup=papuaEmbedDelim
\                      start=/`/ skip=/\\\\\|\\`/ end=/`/
\                      contains=@papuaJS
hi def link papuaEmbedDelim papuaOperator

syn region coffeeInterp matchgroup=coffeeInterpDelim start=/#{/ end=/}/ contained
\                       contains=@coffeeAll
hi def link coffeeInterpDelim PreProc

" This is used instead of TOP to keep things papua-specific for good
" embedding. `contained` groups aren't included.
syn cluster papuaAll contains=papuaStatement,papuaRepeat,papuaConditional,
\                              papuaException,papuaKeyword,papuaOperator,
\                              papuaExtendedOp,papuaSpecialOp,papuaBoolean,
\                              papuaGlobal,papuaSpecialVar,papuaSpecialIdent,
\                              papuaObject,papuaConstant,papuaString,
\                              papuaNumber,papuaFloat,papuaReservedError,
\                              papuaObjAssign,papuaComment,papuaBlockComment,
\                              papuaEmbed,papuaRegex,papuaHeregex,
\                              papuaHeredoc,papuaSpaceError,
\                              papuaSemicolonError,papuaDotAccess,
\                              papuaProtoAccess,papuaCurlies,papuaBrackets,
\                              papuaParens

if !exists('b:current_syntax')
  let b:current_syntax = 'papua'
endif
