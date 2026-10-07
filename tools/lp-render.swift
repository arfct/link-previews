// Renders link previews with Apple's LinkPresentation framework, the one
// Messages uses, so you can see an iMessage card without a phone.
//
//   swiftc -O tools/lp-render.swift -o lp-render
//   ./lp-render <outdir> name=url [name=url …]
//
// For each URL it prints the metadata LinkPresentation extracted (including
// private fields such as usesActivityPub and itemType) and writes
// <outdir>/<name>.png, rendered by LPLinkView at 300pt wide.
//
// Works against localhost, so you can serve tag variants from a scratch
// server. Run it outside any network sandbox: LinkPresentation fetches
// through WebKit's networking process.

import AppKit
import LinkPresentation

setbuf(stdout, nil)

let args = CommandLine.arguments
guard args.count >= 3 else {
  print("usage: lp-render <outdir> name=url [name=url …]")
  exit(1)
}
let outDir = args[1]
let jobs = args.dropFirst(2).map { arg -> (String, URL) in
  let parts = arg.split(separator: "=", maxSplits: 1).map(String.init)
  return (parts[0], URL(string: parts[1])!)
}

_ = NSApplication.shared
var retained: [AnyObject] = []  // providers and views are cancelled if released
var remaining = jobs.count

func dump(_ name: String, _ md: LPLinkMetadata) {
  print("\(name): \(md.originalURL?.absoluteString ?? "")")
  var count: UInt32 = 0
  var cls: AnyClass? = type(of: md)
  while let c = cls, c != NSObject.self {
    if let props = class_copyPropertyList(c, &count) {
      for i in 0..<Int(count) {
        let key = String(cString: property_getName(props[i]))
        if ["hash", "superclass", "description", "debugDescription"].contains(key) { continue }
        if let value = md.value(forKey: key) {
          let text = "\(value)".replacingOccurrences(of: "\n", with: " ")
          print("  \(key) = \(text.prefix(120))")
        }
      }
    }
    cls = class_getSuperclass(c)
  }
}

for (name, url) in jobs {
  let provider = LPMetadataProvider()
  provider.timeout = 20
  retained.append(provider)
  provider.startFetchingMetadata(for: url) { metadata, error in
    DispatchQueue.main.async {
      guard let md = metadata else {
        print("\(name): error \(String(describing: error))")
        remaining -= 1
        return
      }
      dump(name, md)

      let view = LPLinkView(metadata: md)
      let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 320, height: 800),
                            styleMask: [.borderless], backing: .buffered, defer: false)
      retained.append(contentsOf: [view, window])
      view.frame = NSRect(x: 0, y: 0, width: 300, height: 10)
      let height = view.fittingSize.height > 20 ? view.fittingSize.height : 400
      view.frame = NSRect(x: 0, y: 0, width: 300, height: height)
      window.contentView?.addSubview(view)

      // Images load asynchronously after the view is created
      DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
        view.layoutSubtreeIfNeeded()
        let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds)!
        view.cacheDisplay(in: view.bounds, to: rep)
        let png = rep.representation(using: .png, properties: [:])!
        try! png.write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
        print("\(name): wrote \(outDir)/\(name).png")
        remaining -= 1
      }
    }
  }
}

// LinkPresentation needs a running main run loop, not dispatchMain()
while remaining > 0 { RunLoop.main.run(until: Date().addingTimeInterval(0.2)) }
