package main

import (
    "log"
    "embed"

    "github.com/wailsapp/wails/v2"
    "github.com/wailsapp/wails/v2/pkg/options"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
    err := wails.Run(&options.App{
        Title:  "Sylos",
        Width:  1024,
        Height: 768,
        Assets: assets, // <- important
    })
    if err != nil {
        log.Fatal(err)
    }
}

