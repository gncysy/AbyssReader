!macro preInit
  StrCpy $INSTDIR "$PROGRAMFILES\AbyssReader"
!macroend

!macro customInit
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayName" "墨阅"
!macroend

!macro customInstall
  !ifdef INSTALL_DIR_FINAL
    CopyFiles "$INSTDIR\墨阅.exe" "$INSTDIR\abyss-reader.exe"
    Delete "$INSTDIR\墨阅.exe"
  !endif

  SetOutPath "$INSTDIR"
  !ifdef DESKTOP_SHORTCUTS
    CreateShortCut "$DESKTOP\墨阅.lnk" "$INSTDIR\abyss-reader.exe" "" "$INSTDIR\abyss-reader.exe" 0
  !endif

  !ifdef START_MENU_SHORTCUTS
    CreateDirectory "$SMPROGRAMS\墨阅"
    CreateShortCut "$SMPROGRAMS\墨阅\墨阅.lnk" "$INSTDIR\abyss-reader.exe" "" "$INSTDIR\abyss-reader.exe" 0
    WriteIniStr "$SMPROGRAMS\墨阅\Website.url" "InternetShortcut" "URL" "https://github.com/your-repo/AbyssReader"
    CreateShortCut "$SMPROGRAMS\墨阅\Uninstall 墨阅.lnk" "$INSTDIR\Uninstall 墨阅.exe" "" "$INSTDIR\Uninstall 墨阅.exe" 0
  !endif
!macroend

!macro customUnInstall
  Delete "$DESKTOP\墨阅.lnk"
  RMDir /r "$SMPROGRAMS\墨阅"
!macroend
