import PhotoSwipeLightbox from 'photoswipe/lightbox';
import PhotoSwipeDynamicCaption from 'photoswipe-dynamic-caption-plugin';
import 'photoswipe/style.css';

const lightbox = new PhotoSwipeLightbox({
  gallery: 'body',
  children: 'figure > a',
  bgOpacity: 0.90,
  zoom: false,
  pswpModule: () => import('photoswipe')
});

const captionPlugin = new PhotoSwipeDynamicCaption(lightbox, {
  type: 'below',
  captionContent: (element) => {
    const anchorElement = element.data.element;
    const figure = anchorElement.closest('figure');
    const figCaption = figure?.querySelector('figcaption');
    return figCaption ? figCaption.textContent.trim() : '';
  }
});

lightbox.init();
console.info("PhotoSwipe initialized!");
