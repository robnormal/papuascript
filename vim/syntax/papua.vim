" Vim syntax file
" Language:        PapuaScript
" Maintainer:        Rob Rosenbaum <rob@robrosenbaum.com>

if !exists("main_syntax")
  if version < 600
    syntax clear
  elseif exists("b:current_syntax")
    finish
  endif
  let main_syntax = 'papuascript'
elseif exists("b:current_syntax") && b:current_syntax == "papuascript"
  finish
endif

" papuaScript identifiers can have dollar signs.
setlocal isident+=$

" let s:cpo_save = &cpo
" set cpo&vim

syn keyword papuaScriptCommentTodo      TODO FIXME XXX TBD contained
syn match   papuaScriptLineComment      +//.*+ contains=@Spell,papuaScriptCommentTodo
syn region  papuaScriptComment               start="/\*"  end="\*/" contains=@Spell,papuaScriptComment,papuaScriptCommentTodo
" syn match   papuaScriptSpecial               "\\\d\d\d\|\\."
syn region  papuaScriptString               start=+"+  skip=+\\\\\|\\"+  end=+"+  contains=papuaScriptSpecial
syn region  papuaScriptString               start=+'+  skip=+\\\\\|\\'+  end=+'+  contains=papuaScriptSpecial
syn region  papuaScriptString               start=/%{/ skip=/\\\\\|\\}/  end=/}/  contains=papuaScriptSpecial,papuaExtendedOp


syn match papuaScriptMemberAssign /\(\([,{]\|^\)\s*\)\@<=\w\+\s*:\s\+\(\w\+\s\+in\)\@!/ contains=papuaExtendedOp display

syn match papuaIdentifierString /\W\@<=:\w\+/
syn match papuaScriptUpdate /^\s*\w\+\(.*:=\)\@=/

" syn region  papuaTernary             start=/??/ skip=/(.*)/  end=/:/

syn match   papuaScriptSpecialCharacter "'\\.'"
syn match   papuaScriptNumber               "-\=\<\d\+L\=\>\|0[xX][0-9a-fA-F]\+\>"

syn match papuaForMod /\v<(own|index|keys)>/ contained

syn match papuaWithAs /\((.\+)\)\@<=\s\+as/

syn keyword papuaScriptConditional        if else switch
syn keyword papuaScriptRepeat                while do in
syn keyword papuaScriptFor                for  nextgroup=papuaForMod skipwhite
syn keyword papuaScriptBranch                break continue
syn keyword papuaScriptOperator                var new delete instanceof typeof
syn keyword papuaScriptType                Array Boolean Date Function Number Object String RegExp
syn keyword papuaScriptStatement        return 
syn keyword papuaScriptImport                with nextgroup=papuaWithAs skipwhite
syn keyword papuaScriptBoolean                true false
syn keyword papuaScriptNull                null undefined
syn keyword papuaScriptIdentifier        arguments this let 
syn keyword papuaScriptLabel                case default
syn keyword papuaScriptException        try catch finally throw
syn keyword papuaScriptMessage                alert confirm prompt status
syn keyword papuaScriptGlobal                self window top parent
syn keyword papuaScriptMember                document event location prototype
" syn keyword papuaScriptDeprecated        escape unescape
syn keyword papuaScriptReserved                abstract boolean byte char class const debugger double enum export extends final float goto implements import int interface long native package private protected public short static super synchronized throws transient volatile 

" A constant-like name in SCREAMING_CAPS
syn match papuaConstant /\<\u[A-Z0-9_]\+\>/ display

syn match papuaExtendedOp /[+\-*#&|\^=!<>?@]\|&&\|||\|\.\|--\|++\|\\\|:\w\@!/ display
syn match papuaExtendedOp /%[^{]\@=/
syn match papuaExtendedOp +/[/*]\@!+
" syn region  papuaScriptRegexpString     start=+/[^/*]+me=e-1 skip=+\\\\\|\\/+ end=+/[gim]\{0,2\}\s*$+ end=+/[gim]\{0,2\}\s*[;.,)\]}]+me=e-1 oneline contains=papuaExtendedOp
" syn region  papuaScriptRegexpString   start=+/\(\*\|/\)\@!+ skip=+\\\\\|\\/+ end=+/[gim]\{,3}+ oneline
syn match  papuaScriptRegexpString   /\v\/(\*|\/|\s)@!\S*\/[gim]{,3}/


syn keyword papuaScriptFunction                "\\" nextgroup=papuaFuncArgs skipwhite
" syn region papuaFuncArg start=/\\/ end=/->/ matchgroup=papuaFuncArgs contains=@papuaExtendedOp
syn match papuaFuncArgs /\v\\\@=(\w+\s+)*-\>/ contains=papuaExtendedOp
syn match papuaFunctionName /@\w\+\s\+/ contains=papuaExtendedOp
syn match papuaFuncArgs /\(^\s*\S\+\)\@<=\(\s\+\w\+\)\+\(\s*:\?=\($\|[^=]\)\)\@=/

syn match papuaSpecialOp /[,;(){}[\]]/ display

" syn region  papuaScriptString               start=/%{/ skip=/\\\\\|\\}/  end=/}/        contains=papuaScriptSpecial,papuaExtendedOp


" dot-notation for numeric indices
" syn match papuaNumericAccess /\([^A-Za-z_]\d\+\|\s|^\)\@<!\.\d\+/ contains=papuaExtendedOp display

" Operator-fied function
syn region papuaOpFunc start=/`/ end=/`/

" Updated variables; not needed unless you want object literal members to have
" be highlighted deifferently
" syn match papuaUpdated /\w\+\(\(\.\w\+\)*\)\@=\s*:=/ contains=papuaExtendedOp

" do-notation
" syn match papuaCpsNotation /<-\w*/ contains=@papuaExtendedOp display
" hi def link papuaCpsNotation papuaExtendedOp

syn match papuaMethodChain /\s\.\s*\w\+/ display

syn match papuaImportKeywords /\<with\>\|\<as\>/ contains=papuaExtendedOp contained display
syn match papuaImport /\vwith\s+\(.*\)(\s+as\s+\w+)?/ contains=papuaImportKeywords,papuaParens display

syn sync fromstart
syn sync maxlines=100

if main_syntax == "papuascript"
  syn sync ccomment papuaScriptComment
endif

" Define the default highlighting.
" For version 5.7 and earlier: only when not done already
" For version 5.8 and later: only when an item doesn't have highlighting yet
if version >= 508 || !exists("did_papuascript_syn_inits")
  if version < 508
    let did_papuascript_syn_inits = 1
    command -nargs=+ HiLink hi link <args>
  else
    command -nargs=+ HiLink hi def link <args>
  endif

  HiLink papuaScriptComment            Comment
  HiLink papuaScriptLineComment        Comment
  HiLink papuaScriptCommentTodo        Todo
  HiLink papuaScriptSpecial            Special
  HiLink papuaScriptString             String
  HiLink papuaScriptCharacter          Character
  HiLink papuaScriptSpecialCharacter   papuaScriptSpecial
  HiLink papuaScriptNumber             Number
  HiLink papuaScriptConditional        Conditional
  HiLink papuaScriptRepeat             Repeat
  HiLink papuaScriptFor                Repeat
  HiLink papuaScriptBranch             Conditional
  HiLink papuaScriptOperator           Operator
  HiLink papuaScriptType               Type
  HiLink papuaScriptStatement          Statement
  HiLink papuaScriptImport             Statement
  HiLink papuaScriptError              Error
  HiLink papuaScrParenError            papuaScriptError
  HiLink papuaScriptNull               Constant
  HiLink papuaScriptBoolean            Constant
  HiLink papuaScriptRegexpString       String

  HiLink papuaScriptIdentifier         Special
  HiLink papuaScriptLabel              Label
  HiLink papuaScriptException          Exception
  HiLink papuaScriptMessage            Keyword
  HiLink papuaScriptGlobal             Keyword
  HiLink papuaScriptMember             Keyword
  HiLink papuaScriptDeprecated         Exception
  HiLink papuaScriptReserved           Keyword
  HiLink papuaScriptDebug              Debug
  HiLink papuaScriptConstant           Label

  HiLink papuaConstant                 Constant
  HiLink papuaExtendedOp               papuaOperator
  HiLink papuaOperator                 Operator
  HiLink papuaFuncArgs                 Special
  HiLink papuaSpecialOp                SpecialChar
  HiLink papuaScriptMemberAssign       Constant
  HiLink papuaNumericAccess            Identifier
  HiLink papuaOpFunc                   papuaOperator
  HiLink papuaFunctionName             Constant
  HiLink papuaUpdated                  Identifier
  HiLink papuaMethodChain              Identifier
  HiLink papuaImportKeywords           Special

  HiLink papuaIdentifierString         Constant
  HiLink papuaScriptUpdate             Identifier
  HiLink papuaForMod Keyword
  HiLink papuaWithAs Keyword

  delcommand HiLink
endif

let b:current_syntax = "papuascript"
if main_syntax == 'papuascript'
  unlet main_syntax
endif
" let &cpo = s:cpo_save
" unlet s:cpo_save

" vim: ts=8

