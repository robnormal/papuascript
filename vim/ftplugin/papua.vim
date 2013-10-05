" Language:    PapuaScript
" Maintainer:  
" URL:         
" License:     

if exists("b:did_ftplugin")
  finish
endif

let b:did_ftplugin = 1

setlocal formatoptions=cql
setlocal comments=://
setlocal commentstring=//\ %s
setlocal omnifunc=javascriptcomplete#CompleteJS
setlocal expandtab

