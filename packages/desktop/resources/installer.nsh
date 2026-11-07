!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${if} ${FileExists} "$APPDATA\${PRODUCT_NAME}\runtime-consumer.id"
      FileOpen $0 "$APPDATA\${PRODUCT_NAME}\runtime-consumer.id" r
      FileRead $0 $1 32
      FileClose $0
      StrLen $2 $1
      ${if} $2 == 32
        nsExec::ExecToLog '"$INSTDIR\resources\sidecar\keywork.exe" node consumer remove --product "${PRODUCT_NAME}" --installation "$1" --json'
        Pop $0
        ${if} $0 == 0
          Delete "$APPDATA\${PRODUCT_NAME}\runtime-consumer.id"
          Delete "$APPDATA\${PRODUCT_NAME}\node-installed.json"
        ${endIf}
      ${endIf}
    ${endIf}
    Delete "$APPDATA\${PRODUCT_NAME}\node-declined.json"
  ${endIf}
!macroend
